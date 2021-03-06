const defaultConfig = require('./config')
const dynamodb = require('./dynamodb')
const s3 = require('./s3')
const {createHash} = require('crypto')

const {
  resolveConfig,
  retryPromiseWithJitteredBackoff,
  parseKeyProperties,
  dateString,
} = require('./utils')
const {
  ConfigurationError,
  BusyCommittingError,
  AggregateNotFoundError,
} = require('./errors')

class Aggregate {
  static reducer() {
    throw new Error(
      'You must specify a reducer: (state, event, commit) => newState'
    )
  }

  static stateToJS(state) {
    return state
  }

  static jsToState(js) {
    return js
  }

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

  static keyFromProps(props) {
    const {keyString} = parseKeyProperties({
      schema: this.keySchema,
      props,
      separator: this.keySchemaSeparator,
    })

    return keyString
  }

  static async load(a, b) {
    const aggregateKey = typeof a === 'string' ? a : this.keyFromProps(a)

    const props = b || a

    const {version, time, fail, consistentRead, ...rest} = props || {}

    const aggregate = new this({...rest, aggregateKey})
    await aggregate.hydrate({version, time, consistentRead})

    if (
      this.keySchema &&
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

  static async commit(...args) {
    let keyProps, events

    if (args.length === 1) {
      keyProps = {}
      events = args[0]
    } else {
      keyProps = args[0]
      events = args[1]
    }

    const commitStartedAt = new Date()
    const aggregateType = this.name
    const aggregateKey = this.keyFromProps(keyProps)

    return await retryPromiseWithJitteredBackoff(
      async attempts => {
        const headCommit = await dynamodb.getAggregateHeadCommit({
          aggregateType,
          aggregateKey,
        })

        const commitData = {
          aggregateType,
          aggregateKey,
          version: headCommit ? headCommit.version + 1 : 1,
          events,
        }

        const commitRecord = dynamodb.serializeCommit(commitData)
        await dynamodb.commit(commitRecord)

        const totalTimeSpent = new Date() - commitStartedAt
        this.logger.debug(
          {
            aggregateType,
            aggregateKey,
            function: 'commit',
            totalTimeSpent,
            attempts,
          },
          `${this.aggregateType}:${this.aggregateKey} commit() ${events
            .map(event => event.type)
            .join(', ')} (${totalTimeSpent}ms)`
        )

        return dynamodb.deserializeCommit(commitRecord)
      },
      {
        initialDelay: 5,
        maxAttempts: 10,
        shouldRetry: error => error.code === 'ConditionalCheckFailedException',
      }
    )
  }

  static async *scanInstances({transformConcurrency, ...rest} = {}) {
    let currentAggregate = null

    const commits = dynamodb.queryCommits({
      aggregateType: this.name,
      upcasters: this.upcasters,
      transform: this.lazyTransformation,
      transformConcurrency,
      ...rest,
    })

    for await (const commit of commits) {
      const thisAggregateKey = commit.aggregateKey
      if (
        !currentAggregate ||
        currentAggregate.aggregateKey !== thisAggregateKey
      ) {
        if (currentAggregate) yield currentAggregate

        currentAggregate = new this({aggregateKey: thisAggregateKey})
      }

      currentAggregate.processCommit(commit)
    }

    if (currentAggregate) {
      yield currentAggregate
    }
  }

  static get instances() {
    return this.scanInstances()
  }

  static get upcastersChecksum() {
    return Object.keys(this.upcasters).length
      ? createHash('md5')
          .update(
            JSON.stringify(
              Object.keys(this.upcasters).map(eventType => ({
                eventType,
                versions: Object.keys(this.upcasters[eventType]),
              }))
            )
          )
          .digest('base64')
      : undefined
  }

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

    this.version = 0
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
          committedAt: new Date(),
          events,
        }

        this.commitInFlight = commitData
        const commitRecord = dynamodb.serializeCommit(commitData)
        const commitResult = await dynamodb.commit(commitRecord)
        const {ConsumedCapacity} = commitResult

        if (ConsumedCapacity) {
          writeUnitsConsumed += ConsumedCapacity.CapacityUnits
        }

        this.processCommit(dynamodb.deserializeCommit(commitRecord))

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
          this.config.logger.debug(
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

  async hydrate({
    version: requestedVersion,
    time: requestedTime,
    consistentRead = true,
  } = {}) {
    const hydrateStartedAt = new Date()
    const requestedTimeString = dateString(requestedTime)

    if (
      requestedVersion < this.version ||
      requestedTimeString < this.headCommitTimestamp
    ) {
      this.reset()
    }

    let timeSpentQuerying = 0
    let timeSpentProcessing = 0
    let snapshotVersionLoaded = null
    let timeSpentReadingSnapshot = 0
    let readUnitsConsumed = 0
    let timeSpentRewritingSnapshot = 0

    const hydratedFromVersion = this.version

    let shouldRewriteSnapshot = false

    if (this.config.snapshots) {
      const snapshotReadStart = new Date()

      const snapshot = await s3.readAggregateSnapshot(
        {
          aggregateType: this.aggregateType,
          aggregateKey: this.aggregateKey,
        },
        this.config
      )
      timeSpentReadingSnapshot = new Date() - snapshotReadStart

      if (snapshot) {
        let shouldUseSnapshot = false
        const {
          state,
          version,
          upcastersChecksum,
          headCommitTimestamp,
        } = snapshot
        if (upcastersChecksum !== this.constructor.upcastersChecksum) {
          shouldRewriteSnapshot = true
        } else if (requestedVersion) {
          shouldUseSnapshot = requestedVersion >= version
        } else if (requestedTime) {
          shouldUseSnapshot = requestedTimeString >= headCommitTimestamp
        } else if (version > this.version) {
          shouldUseSnapshot = true
        }

        if (shouldUseSnapshot) {
          this._state = this.constructor.jsToState(state)
          this.version = version
          snapshotVersionLoaded = version
        }
      }
    }

    // not necessarily requested time or version
    if (this.version !== requestedVersion) {
      const commits = dynamodb.getAggregateCommits(
        {
          aggregateType: this.aggregateType,
          aggregateKey: this.aggregateKey,
          maxVersion: requestedVersion,
          minVersion: this.version + 1,
          maxTime: requestedTime,
          upcasters: this.constructor.upcasters,
          transform: this.constructor.lazyTransformation,
          consistentRead,
        },
        ({consumedCapacityUnits, queryTime}) => {
          readUnitsConsumed += consumedCapacityUnits
          timeSpentQuerying += queryTime
        }
      )

      for await (const commit of commits) {
        const processingStartedAt = new Date()
        this.processCommit(commit)
        timeSpentProcessing += new Date() - processingStartedAt
      }
    }

    if (shouldRewriteSnapshot) {
      const rewriteSnapshotStartedAt = new Date()
      await this.writeSnapshot()
      timeSpentRewritingSnapshot = new Date() - rewriteSnapshotStartedAt
    }

    const totalTimeSpent = new Date() - hydrateStartedAt

    this.logger.debug(
      {
        timeSpentReadingSnapshot,
        timeSpentQuerying,
        timeSpentProcessing,
        timeSpentRewritingSnapshot,
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

  processCommit(commit) {
    if (!commit) throw new Error('Commit not provided to processCommit()')
    this._state = commit.events.reduce(
      (state, event) => this.constructor.reducer(state, event, commit),
      this._state
    )

    this.version = commit.version
    this.headCommitTimestamp = commit.committedAt
    this.headCommitId = commit.commitId
  }

  async writeSnapshot() {
    const {
      version,
      state,
      aggregateType,
      aggregateKey,
      headCommitTimestamp,
    } = this

    await s3.writeAggregateSnapshot({
      aggregateType,
      aggregateKey,
      version,
      state,
      headCommitTimestamp,
      upcastersChecksum: this.constructor.upcastersChecksum,
    })
  }

  reset() {
    this.version = 0
    this._state = undefined
    this.headCommitId = undefined
    this.headCommitTimestamp = undefined
  }

  get aggregateId() {
    return [this.aggregateType, this.aggregateKey].join(':')
  }
}

Object.assign(Aggregate, {
  upcasters: {},
  lazyTransformation: false,
  keySchemaSeparator: '.',
  logger: defaultConfig.logger,
})

module.exports = Aggregate
