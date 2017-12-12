import config from './config'
import {
  serializeCommit,
  deserializeCommit,
  getAggregateCommits,
} from './dynamodb'
import {resolveConfig} from './utils'
import {VersionConflictExhaustion} from './errors'

class Aggregate {
  static reducer = null
  static commands = {}
  static stateToJS = state => state
  static jsToState = js => js

  version = 0
  isCommitting = false

  constructor(constructorConfig = {}) {
    const AWS = config.configuredAWS

    this.ddb = new AWS.DynamoDB()
    this.s3 = new AWS.S3()

    const {batchWriter, aggregateId = this.constructor.name} = constructorConfig

    this.config = resolveConfig(
      [config, this.constructor, constructorConfig],
      [
        'snapshotsEnabled',
        'snapshotS3Bucket',
        'snapshotFrequency',
        'reducer',
        'tableName',
        'getLogger',
      ]
    )

    const {
      getLogger,
      snapshotsEnabled,
      snapshotFrequency,
      snapshotS3Bucket,
      tableName,
      reducer,
    } = this.config

    if (typeof reducer !== 'function') {
      throw new Error(
        'You need to set a reducer function for the aggregate class.'
      )
    }

    if (typeof tableName !== 'string' || !tableName) {
      throw new Error('You need to specify a table name for the aggregate')
    }

    if (snapshotsEnabled) {
      if (!snapshotFrequency) {
        throw new Error(
          'When snapshots are enabled, you need to specify snapshotFrequency'
        )
      } else if (!snapshotS3Bucket) {
        throw new Error(
          'When snapshots are enabled, you need to specify snapshotS3Bucket'
        )
      }
    }

    this.aggregateId = aggregateId
    this.logger = getLogger(aggregateId)
    this.batchWriter = batchWriter

    const {commands} = this.constructor
    for (const commandName of Object.keys(commands)) {
      const command = commands[commandName]
      this[commandName] = async (...args) => {
        let argsToUse = args
        if (typeof command.validation === 'function') {
          const value = await command.validation.apply(this, args)
          argsToUse = [value]
        }

        return command.apply(this, argsToUse)
      }
    }
  }

  get state() {
    return this.constructor.stateToJS(
      this._state || this.constructor.jsToState({})
    )
  }

  get snapshotS3Location() {
    const {snapshotS3Bucket, snapshotS3Prefix} = this.config

    return {
      Bucket: snapshotS3Bucket,
      Key: [snapshotS3Prefix, this.aggregateId].join(''),
    }
  }

  inspect() {
    const {aggregateId, version, state} = this
    return {aggregateId, version, state}
  }

  async retryWithHydration(
    fn,
    {backoffRate = 2, attempts = 10, initialDelay = 1} = {}
  ) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (error.code !== 'ConditionalCheckFailedException') throw error
        await this.hydrate()
      }
      const delay = initialDelay * backoffRate ** attempt
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    throw new VersionConflictExhaustion(
      `Retrying with hydration exhausted after ${attempts} attempts.`
    )
  }

  async hydrate({version: requestedVersion, time: requestedTime} = {}) {
    this.logger.debug('hydrate() start')

    if (this.config.snapshotsEnabled && !requestedVersion && !requestedTime) {
      this.logger.debug(
        this.snapshotS3Location,
        'hydrate() attempting to load snapshot'
      )

      try {
        const {Body: snapshotJSON} = await this.s3
          .getObject(this.snapshotS3Location)
          .promise()
        const {state, version} = JSON.parse(snapshotJSON)

        if (version > this.version) {
          this.logger.debug(`hydrate() found snapshot for version ${version}`)
          this._state = this.constructor.jsToState(state)
          this.version = version
        } else {
          this.logger.debug(
            `hydrate() snapshot version (${version}) older than ours (${
              this.version
            })`
          )
        }
      } catch (error) {
        if (error.code !== 'NoSuchKey') throw error
        this.logger.debug('hydrate() no snapshot found')
      }
    }

    await getAggregateCommits(
      {
        aggregateId: this.aggregateId,
        maxVersion: requestedVersion,
        maxTime: requestedTime,
      },
      this.processCommitRecords
    )

    this.logger.debug('hydrate() completed')

    return this
  }

  processCommitRecords(commitRecords) {
    const commits = commitRecords.map(deserializeCommit)

    const relevantCommits = commits.filter(
      commit => commit.version > this.version
    )

    if (!relevantCommits.length) return

    this._state = relevantCommits.reduce(
      (state, commit) =>
        commit.events.reduce(
          (state, event) => this.config.reducer(state, event, commit),
          state
        ),
      this._state
    )

    this.version = relevantCommits[relevantCommits.length - 1].version
  }

  async commit(eventOrEvents, {retry = false} = {}) {
    if (retry) {
      return this.retryWithHydration(() => this.commit(eventOrEvents))
    }

    if (this.isCommitting) throw new Error('Commit in progress')
    this.isCommitting = true

    this.logger.debug('commit() start')

    try {
      const events = Array.isArray(eventOrEvents)
        ? eventOrEvents
        : [eventOrEvents]

      const record = serializeCommit({
        aggregateId: this.aggregateId,
        version: this.version + 1,
        events,
      })

      await (this.batchWriter || this.ddb)
        .putItem({
          TableName: this.config.tableName,
          Item: record,
          ConditionExpression: 'attribute_not_exists(version)',
          ReturnValues: 'NONE',
        })
        .promise()

      this.processCommitRecords([record])

      if (
        this.config.snapshotsEnabled &&
        this.version % this.config.snapshotFrequency === 0
      ) {
        await this.writeSnapshot()
      }
    } finally {
      this.isCommitting = false
    }

    this.logger.debug('commit() completed')

    return this
  }

  async writeSnapshot() {
    const {version, state, snapshotS3Location} = this

    this.logger.debug(
      snapshotS3Location,
      `commit() storing snapshot for version ${version}`
    )

    await this.s3
      .putObject({
        ...this.snapshotS3Location,
        Body: JSON.stringify({version, state}),
      })
      .promise()
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
