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

  // The version of the first commit is 1
  version = 0

  // Keep track of inflight commits to prevent parallel commits
  commitInFlight = null

  constructor(constructorConfig = {}) {
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

    this.aggregateId = this.constructor.name
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
    if (retry) {
      return retryPromiseWithJitteredBackoff(() => this.commit(eventOrEvents), {
        initialDelay: 5,
        maxAttempts: 10,
        shouldRetry: error => error.code === 'ConditionalCheckFailedException',
        beforeRetry: () => this.hydrate(),
        ...(typeof retry === 'object' && retry),
      })
    }

    if (this.commitInFlight) {
      throw new BusyCommittingError(
        `Busy committing version ${this.commitInFlight.version}`
      )
    }

    try {
      const events = Array.isArray(eventOrEvents)
        ? eventOrEvents
        : [eventOrEvents]

      const commitData = {
        aggregateId: this.aggregateId,
        version: this.version + 1,
        events,
      }

      this.commitInFlight = commitData

      const commitRecord = dynamodb.serializeCommit(commitData)
      await dynamodb.commit(commitRecord)

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

    return this
  }

  async hydrate({version: requestedVersion, time: requestedTime} = {}) {
    if (this.config.snapshots && !requestedVersion && !requestedTime) {
      const {state, version} = await s3.readAggregateSnapshot(
        {aggregateId: this.aggregateId},
        this.config
      )

      if (version > this.version) {
        // this.logger.debug(`hydrate() found snapshot for version ${version}`)
        this._state = this.constructor.jsToState(state)
        this.version = version
      } else {
        this.logger.debug(
          `hydrate() snapshot version (${version}) older than ours (${
            this.version
          })`
        )
      }
    }

    await dynamodb.getAggregateCommits(
      {
        aggregateId: this.aggregateId,
        maxVersion: requestedVersion,
        maxTime: requestedTime,
      },
      this.processCommits.bind(this)
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

Aggregate.load = async function({version, time, ...constructorParams} = {}) {
  const aggregate = new this(constructorParams)
  await aggregate.hydrate({version, time})

  return aggregate
}

Aggregate.getState = async function(...args) {
  const {state} = await this.load(...args)

  return state
}

export default Aggregate
