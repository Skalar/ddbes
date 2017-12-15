import defaultConfig from './config'

import * as dynamodb from './dynamodb'
import * as s3 from './s3'

import {resolveConfig, retryPromiseWithJitteredBackoff} from './utils'
import {ConfigurationError, BusyCommittingError} from './errors'

class Aggregate {
  static reducer = () => {
    throw new Error(
      'You must specify a reducer: (state, event, commit) => newState'
    )
  }

  // Hooks for using non-plain js state (e.g. immutablejs)
  static stateToJS = state => state
  static jsToState = js => js

  static async load({version, time, ...constructorParams} = {}) {
    const aggregate = new this(constructorParams)
    await aggregate.hydrate({version, time})

    return aggregate
  }

  static async getState(...args) {
    const {state} = await this.load(...args)

    return state
  }

  // The version of the first commit is 1
  version = 0

  // Keep track of inflight commits to prevent parallel commits
  commitInFlight = null

  constructor({aggregateId, ...constructorConfig} = {}) {
    this.config = resolveConfig(
      [defaultConfig, this.constructor, constructorConfig],
      [
        'snapshots',
        'snapshotsBucket',
        'snapshotsFrequency',
        'snapshotsPrefix',
        'tableName',
        'logger',
      ]
    )

    this.logger = this.config.logger

    if (
      typeof this.config.tableName !== 'string' ||
      !this.config.tableName.match(/^[a-zA-Z0-9\_\-\.]{3,255}$/)
    ) {
      throw new ConfigurationError('You need to specify a valid table name')
    }

    if (this.config.snapshots) {
      if (!this.config.snapshotsFrequency) {
        throw new Error(
          'When snapshots are enabled, you need to specify snapshotsFrequency'
        )
      } else if (!this.config.snapshotsBucket) {
        throw new Error(
          'When snapshots are enabled, you need to specify snapshotsBucket'
        )
      }
    }

    this.aggregateId = aggregateId || this.constructor.name
  }

  // Getter for state to allow for non-plain js state types
  get state() {
    return this.constructor.stateToJS(
      this._state || this.constructor.jsToState({})
    )
  }

  // Provide a cleaned up version of the instance for debugging
  inspect() {
    const {aggregateId, version, state} = this
    return {aggregateId, version, state}
  }

  async commit(eventOrEvents, {retry = false} = {}) {
    const commitStartedAt = new Date()
    let writeUnitsConsumed = 0

    const events = Array.isArray(eventOrEvents)
      ? eventOrEvents
      : [eventOrEvents]

    if (this.commitInFlight) {
      throw new BusyCommittingError(
        `Busy committing version ${this.commitInFlight.version}`
      )
    }

    const perform = async () => {
      try {
        const commitData = {
          aggregateId: this.aggregateId,
          version: this.version + 1,
          events,
        }

        this.commitInFlight = commitData
        const commitRecord = dynamodb.serializeCommit(commitData)
        const commitResult = await dynamodb.commit(commitRecord)
        const {ConsumedCapacity} = commitResult

        if (ConsumedCapacity) {
          writeUnitsConsumed += ConsumedCapacity.CapacityUnits
        }

        this.processCommits([commitData])

        if (
          this.config.snapshots &&
          this.version % this.config.snapshotsFrequency === 0
        ) {
          await this.writeSnapshot()
        }
      } finally {
        this.commitInFlight = null
      }
    }

    if (retry) {
      return retryPromiseWithJitteredBackoff(
        async attempts => {
          await perform()
          const totalTimeSpent = new Date() - commitStartedAt
          this.logger.debug(
            {
              aggregateId: this.aggregateId,
              function: 'commit',
              writeUnitsConsumed,
              totalTimeSpent,
              attempts,
            },
            `${this.aggregateId} commit() ${events
              .map(event => event.type)
              .join(', ')} (${totalTimeSpent}ms)`
          )

          return this
        },
        {
          initialDelay: 5,
          maxAttempts: 10,
          shouldRetry: error =>
            error.code === 'ConditionalCheckFailedException',
          beforeRetry: () => this.hydrate(),
          ...(typeof retry === 'object' && retry),
        }
      )
    }

    await perform()

    const totalTimeSpent = new Date() - commitStartedAt

    this.logger.debug(
      {
        aggregateId: this.aggregateId,
        function: 'commit',
        totalTimeSpent,
        writeUnitsConsumed,
        eventTypes: events.map(event => event.type),
      },
      `${this.aggregateId} commit() ${events
        .map(event => event.type)
        .join(', ')} (${totalTimeSpent}ms)`
    )

    return this
  }

  async hydrate({version: requestedVersion, time: requestedTime} = {}) {
    const hydrateStartedAt = new Date()
    let timeSpentQuerying = 0
    let timeSpentProcessing = 0
    let snapshotVersionLoaded = null
    let timeSpentReadingSnapshot = 0
    let readUnitsConsumed = 0
    const hydratedFromVersion = this.version

    if (this.config.snapshots && !requestedVersion && !requestedTime) {
      const snapshotReadStart = new Date()
      const {state, version} = await s3.readAggregateSnapshot(
        {aggregateId: this.aggregateId},
        this.config
      )

      timeSpentReadingSnapshot = new Date() - snapshotReadStart

      if (version > this.version) {
        this._state = this.constructor.jsToState(state)
        this.version = version
        snapshotVersionLoaded = version
      }
    }

    let queryStartedAt = new Date()

    await dynamodb.getAggregateCommits(
      {
        aggregateId: this.aggregateId,
        maxVersion: requestedVersion,
        maxTime: requestedTime,
      },
      async (commits, {ConsumedCapacity}) => {
        if (ConsumedCapacity) {
          readUnitsConsumed += ConsumedCapacity.CapacityUnits
        }

        timeSpentQuerying += new Date() - queryStartedAt
        const processingStartedAt = new Date()
        await this.processCommits(commits)
        timeSpentProcessing += new Date() - processingStartedAt
        queryStartedAt = new Date()
      }
    )

    const totalTimeSpent = new Date() - hydrateStartedAt

    this.logger.debug(
      {
        timeSpentReadingSnapshot,
        timeSpentQuerying,
        timeSpentProcessing,
        aggregateId: this.aggregateId,
        snapshotVersionLoaded,
        totalTimeSpent,
        hydratedFromVersion,
        readUnitsConsumed,
        version: this.version,
        function: 'hydrate',
      },
      this.version > hydratedFromVersion
        ? `${this.aggregateId} hydrate() version ${hydratedFromVersion} => ${
            this.version
          } ${
            snapshotVersionLoaded
              ? `[loaded version ${snapshotVersionLoaded} from snapshot] `
              : ''
          }(${totalTimeSpent}ms)`
        : `${this.aggregateId} hydrate() no new commits, still at version ${
            this.version
          }`
    )

    return this
  }

  processCommits(commits = []) {
    if (!commits.length) return

    this._state = commits.reduce(
      (state, commit) =>
        commit.events.reduce(
          (state, event) => this.constructor.reducer(state, event, commit),
          state
        ),
      this._state
    )

    this.version = commits[commits.length - 1].version
  }

  async writeSnapshot() {
    const {version, state, aggregateId} = this

    await s3.writeAggregateSnapshot({aggregateId, version, state})
  }
}

export default Aggregate
