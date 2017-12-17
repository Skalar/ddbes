import defaultConfig from './config'

import * as dynamodb from './dynamodb'
import * as s3 from './s3'
import {asyncify, queue} from 'async'

import {
  resolveConfig,
  retryPromiseWithJitteredBackoff,
  parseKeyProperties,
} from './utils'
import {
  ConfigurationError,
  BusyCommittingError,
  AggregateNotFoundError,
} from './errors'

class Aggregate {
  static reducer = () => {
    throw new Error(
      'You must specify a reducer: (state, event, commit) => newState'
    )
  }

  static stateToJS = state => state
  static jsToState = js => js
  static upcasters = {}
  static lazyTransformation = false
  static keySchemaSeparator = '.'
  static keySchema = null

  static async create(props = {}, constructorParams) {
    const {keyString: aggregateKey, keyProps} = parseKeyProperties({
      schema: this.keySchema,
      props,
      separator: this.keySchemaSeparator,
    })

    const instance = new this({
      aggregateKey,
      ...constructorParams,
    })

    await instance.hydrate()
    await instance.create({...props, ...keyProps})

    return instance
  }

  static async loadOrCreate(...args) {
    return (await this.load(...args)) || (await this.create(...args))
  }

  static async getState(...args) {
    const instance = await this.load(...args)

    return instance && instance.state
  }

  static async load(a, b) {
    const {keySchema, keySchemaSeparator} = this

    const {keyString: aggregateKey} =
      typeof a === 'string'
        ? {keyString: a}
        : parseKeyProperties({
          schema: keySchema,
          props: a,
          separator: keySchemaSeparator,
        })

    const props = b || a

    const {version, time, fail, ...rest} = props || {}

    const aggregate = new this({...rest, aggregateKey})
    await aggregate.hydrate({version, time})

    if (
      keySchema &&
      !(aggregate.version && Object.keys(aggregate.state).length)
    ) {
      if (fail) {
        throw new AggregateNotFoundError(
          `${aggregate.aggregateType} with key '${aggregateKey}' does exist`
        )
      }

      return null
    }

    return aggregate
  }

  // The version of the first commit is 1
  version = 0

  // Keep track of inflight commits to prevent parallel commits
  commitInFlight = null

  constructor({aggregateType, aggregateKey = '0', ...constructorConfig} = {}) {
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

    this.aggregateType = aggregateType || this.constructor.name
    this.aggregateKey = aggregateKey
  }

  // Getter for state to allow for non-plain js state types
  get state() {
    return this.constructor.stateToJS(
      this._state || this.constructor.jsToState({})
    )
  }

  create() {
    throw new Error(
      `${this.constructor.name} class does not have instance method create()`
    )
  }

  // Provide a cleaned up version of the instance for debugging
  inspect() {
    const {aggregateType, aggregateKey, version, state} = this
    return {aggregateType, aggregateKey, version, state}
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
          aggregateType: this.aggregateType,
          aggregateKey: this.aggregateKey,
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
              aggregateType: this.aggregateType,
              aggregateKey: this.aggregateKey,
              function: 'commit',
              writeUnitsConsumed,
              totalTimeSpent,
              attempts,
            },
            `${this.aggregateType}:${this.aggregateKey} commit() ${events
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
        aggregateType: this.aggregateType,
        aggregateKey: this.aggregateKey,
        function: 'commit',
        totalTimeSpent,
        writeUnitsConsumed,
        eventTypes: events.map(event => event.type),
      },
      `${this.aggregateType}:${this.aggregateKey} commit() ${events
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
        {
          aggregateType: this.aggregateType,
          aggregateKey: this.aggregateKey,
        },
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
        aggregateType: this.aggregateType,
        aggregateKey: this.aggregateKey,
        maxVersion: requestedVersion,
        maxTime: requestedTime,
        upcasters: this.constructor.upcasters,
        transform: this.constructor.lazyTransformation,
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
        aggregateType: this.aggregateType,
        aggregateKey: this.aggregateKey,
        snapshotVersionLoaded,
        totalTimeSpent,
        hydratedFromVersion,
        readUnitsConsumed,
        version: this.version,
        function: 'hydrate',
      },
      this.version > hydratedFromVersion
        ? `${this.aggregateType}:${
            this.aggregateKey
          } hydrate() version ${hydratedFromVersion} => ${this.version} ${
            snapshotVersionLoaded
              ? `[loaded version ${snapshotVersionLoaded} from snapshot] `
              : ''
          }(${totalTimeSpent}ms)`
        : `${this.aggregateType}:${
            this.aggregateKey
          } hydrate() no new commits, still at version ${this.version}`
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
    const {version, state, aggregateType, aggregateKey} = this

    await s3.writeAggregateSnapshot({
      aggregateType,
      aggregateKey,
      version,
      state,
    })
  }

  static async eachInstance(
    instanceHandlerFn,
    {concurrency = 1, transformConcurrency, ...rest} = {}
  ) {
    let currentAggregate = null
    const aggregateHandlerQueue = queue(
      asyncify(instanceHandlerFn),
      concurrency
    )
    aggregateHandlerQueue.buffer = concurrency

    await dynamodb.queryCommits(
      {
        aggregateType: this.name,
        upcasters: this.upcasters,
        transform: this.lazyTransformation,
        transformConcurrency,
        ...rest,
      },
      async commits => {
        for (const commit of commits) {
          const thisAggregateKey = commit.aggregateKey
          if (
            !currentAggregate ||
            currentAggregate.aggregateKey !== thisAggregateKey
          ) {
            if (currentAggregate) aggregateHandlerQueue.push(currentAggregate)

            currentAggregate = new this({aggregateKey: thisAggregateKey})
          }

          currentAggregate.processCommits([commit])
        }
        while (aggregateHandlerQueue.length >= concurrency) {
          await new Promise(
            resolve => (aggregateHandlerQueue.unsaturated = resolve)
          )
        }
      }
    )

    if (currentAggregate) {
      aggregateHandlerQueue.push(currentAggregate)
    }

    await new Promise(resolve => (aggregateHandlerQueue.drain = resolve))
  }

  get aggregateId() {
    return [this.aggregateType, this.aggregateKey].join(':')
  }
}

export default Aggregate
