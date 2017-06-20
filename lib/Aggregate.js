import config from './config'
import {deserializeCommit, resolveConfig} from './utils'
import AWS from 'aws-sdk'

class Aggregate {
  static reducer = null
  static commands = {}
  static stateToJS = state => state
  static jsToState = js => js

  version = 0
  isCommitting = false

  constructor(constructorConfig = {}) {
    this.ddb = new (config.AWS || AWS).DynamoDB()
    this.s3 = new (config.AWS || AWS).S3()

    const {batchWriter} = constructorConfig

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
      throw new Error('You need to set a reducer function for the aggregate class.')
    }

    if (typeof tableName !== 'string' || !tableName) {
      throw new Error('You need to specify a table name for the aggregate')
    }

    if (snapshotsEnabled) {
      if (!snapshotFrequency) {
        throw new Error('When snapshots are enabled, you need to specify snapshotFrequency')
      }
      else if (!snapshotS3Bucket) {
        throw new Error('When snapshots are enabled, you need to specify snapshotS3Bucket')
      }
    }

    this.logger = getLogger(constructor.name)
    this.batchWriter = batchWriter

    const {commands} = this.constructor

    for (const commandName of Object.keys(commands)) {
      const command = commands[commandName]
      this[commandName] = (...args) => {
        if (Array.isArray(command.validations)) {
          for (const validation of command.validations) {
            if (typeof validation !== 'function') {
              throw new Error('Expected validation to be a function')
            }
            const result = validation.apply(this, args)

            if (result.error) throw result.error
          }
        }
        return command.apply(this, args)
      }
    }
  }

  get state() {
    return this.constructor.stateToJS(this._state)
  }

  get aggregateId() {
    return this.constructor.name
  }

  get snapshotS3Location() {
    const {
      snapshotS3Bucket,
      snapshotS3Prefix,
    } = this.config

    return {
      Bucket: snapshotS3Bucket,
      Key: [snapshotS3Prefix, this.aggregateId].join('')
    }
  }

  inspect() {
    const {aggregateId, version, state} = this
    return {aggregateId, version, state}
  }

  async hydrate({version: requestedVersion, time: requestedTime} = {}) {
    this.logger.debug('hydrate() start')

    if (this.config.snapshotsEnabled && !requestedVersion && !requestedTime) {
      this.logger.debug(this.snapshotS3Location, 'hydrate() attempting to load snapshot')

      try {
        const {Body: snapshotJSON} = await this.s3.getObject(this.snapshotS3Location).promise()
        const {state, version} = JSON.parse(snapshotJSON)

        if (version > this.version) {
          this.logger.debug(`hydrate() found snapshot for version ${version}`)
          this._state = this.constructor.jsToState(state)
          this.version = version
        } else {
          this.logger.debug(`hydrate() snapshot version (${version}) older than ours (${this.version})`)
        }
      }
      catch (error) {
        if (error.code !== 'NoSuchKey') throw error
        this.logger.debug('hydrate() no snapshot found')
      }
    }

    let queryResult = {}

    const query = () => {
      const {LastEvaluatedKey: ExclusiveStartKey} = queryResult
      const commonQueryParams = {
        TableName: this.config.tableName,
        ...(ExclusiveStartKey && {ExclusiveStartKey}),
      }

      if (requestedVersion) {
        this.logger.debug(`hydrate() Fetching commits where version is > ${this.version} and <= ${requestedVersion} from store`)

        return this.ddb.query({
          ...commonQueryParams,
          ConsistentRead: true,
          KeyConditionExpression: 'aggregateId = :a AND version BETWEEN :v AND :v2',
          ExpressionAttributeValues: {
            ':a': {S: this.aggregateId},
            ':v': {N: (this.version + 1).toString()},
            ':v2': {N: requestedVersion.toString()}
          }
        }).promise()
      }

      this.logger.debug(`hydrate() Fetching commits for version > ${this.version} from store`)

      return this.ddb.query({
        ...commonQueryParams,
        ConsistentRead: true,
        KeyConditionExpression: 'aggregateId = :a AND version > :v',
        ExpressionAttributeValues: {
          ':a': {S: this.aggregateId},
          ':v': {N: this.version.toString()}
        }
      }).promise()
    }

    do {
      queryResult = await query()
      if (requestedTime) {
        const filteredCommits = queryResult.Items.filter(
          commit => parseInt(commit.committedAt.N, 10) < requestedTime.valueOf()
        )
        if (!filteredCommits.length) break

        this.processCommitRecords(filteredCommits)
      } else {
        this.processCommitRecords(queryResult.Items)
      }
    } while (queryResult.LastEvaluatedKey)

    this.logger.debug('hydrate() completed')

    return this
  }

  processCommitRecords(commitRecords) {
    const commits = commitRecords.map(deserializeCommit)

    const relevantCommits = commits.filter(commit => commit.version > this.version)

    if (!relevantCommits.length) return

    this._state = relevantCommits.reduce(
      (state, commit) => commit.events.reduce(
        (state, event) => this.config.reducer(state, event, commit),
        state
      ),
      this._state
    )

    this.version = relevantCommits[relevantCommits.length - 1].version
  }

  async commit(eventOrEvents) {
    if (this.isCommitting) throw new Error('Commit in progress')
    this.isCommitting = true

    this.logger.debug('commit() start')

    try {
      const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents]
      const now = Date.now()

      const record = {
        commitId: {S: this.generateCommitId(now)},
        committedAt: {N: now.toString()},
        aggregateId: {S: this.aggregateId},
        version: {N: (this.version + 1).toString()},
        events: {S: JSON.stringify(events)},
        active: {S: 't'}
      }

      await (this.batchWriter || this.ddb).putItem({
        TableName: this.config.tableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(version)',
        ReturnValues: 'NONE'
      }).promise()

      this.processCommitRecords([record])

      if (
        this.config.snapshotsEnabled && (
          this.version % this.config.snapshotFrequency === 0
        )
      ) {
        const {version, state, snapshotS3Location} = this

        this.logger.debug(
          snapshotS3Location,
          `commit() storing snapshot for version ${version}`
        )

        await this.s3.putObject({
          ...this.snapshotS3Location,
          Body: JSON.stringify({version, state})
        }).promise()
      }
    }
    finally {
      this.isCommitting = false
    }

    this.logger.debug('commit() completed')

    return this
  }

  generateCommitId(time = Date.now()) {
    const date = new Date(time).toISOString().replace(/[^0-9]/g, '')
    return [date, this.aggregateId].join(':')
  }
}

// Workaround babel async + lambda issue
Aggregate.load = async function({version, time, ...constructorParams} = {}) {
  const aggregate = new this(constructorParams)
  await aggregate.hydrate({version, time})

  return aggregate
}

export default Aggregate
