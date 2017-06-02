import config from './config'
import AWS from 'aws-sdk'
import {asyncify, eachLimit, cargo} from 'async'
import DynamoDBSubscriber from './dynamodb-subscriber'
import {deserializeCommit} from './utils'

class Projector {
  projectionCommitPromises = {}
  bufferedStreamCommits = []
  loaded = false

  constructor(
    projections,
    {
      commitsPerChunk = 1000,
      tableName = config.tableName,
      logger
    } = {}
  ) {
    this.dynamodb = new (config.AWS || AWS).DynamoDB()
    this.projections = projections
    this.commitProcessingQueue = cargo(
      asyncify(this.processCommits.bind(this)),
      commitsPerChunk
    )

    this.tableName = tableName
    this.logger = logger || config.getLogger('projector')
  }

  async start({watch = true}) {
    if (watch) {
      this.logger.info(`Subscribing to dynamoDB stream for table '${this.tableName}'`)

      this.subscriber = new DynamoDBSubscriber({
        table: this.tableName,
        aws: config.AWS || AWS,
        interval: '1s',
      })

      this.subscriber.on('record', this.onStreamEvent.bind(this))
      this.subscriber.on('error', error => { throw error })
      this.subscriber.start()
    }

    const currentCommits = await Promise.all(
      Object.values(this.projections).map(projection => projection.getCurrentCommitId())
    )

    const commitId = currentCommits.sort()[0] || '0'

    this.logger.info(`Loading commits from store (> ${commitId})`)

    let queryResult = {}
    do {
      queryResult = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'commitsByCommitId',
        KeyConditionExpression: 'active = :a AND commitId > :c',
        ExpressionAttributeValues: {
          ':a': { S: 't' },
          ':c': { S: commitId }
        },
        ...(queryResult.LastEvaluatedKey && {
          ExclusiveStartKey: queryResult.LastEvaluatedKey
        }),
      }).promise()

      this.logger.info(`Processing ${queryResult.Items.length} commits returned by query`)

      const commits = queryResult.Items.map(deserializeCommit)

      await Promise.all(
        commits.map(
          commit => (
            new Promise((resolve, reject) => {
              this.commitProcessingQueue.push(commit, err => {
                return err ? reject(err) : resolve()
              })
            })
          )
        )
      )
    } while (queryResult.LastEvaluatedKey)

    this.loaded = true

    this.logger.info('Done loading commits from store')

    this.queueBufferedCommits()
  }

  async processCommits(commits) {
    await Promise.all(
      Object.keys(this.projections).map(
        async projectionName => {
          const {concurrency, processCommit} = this.projections[projectionName]

          await new Promise((resolve, reject) => {
            eachLimit(
              commits,
              concurrency,
              asyncify(
                async commit => {
                  const promiseKey = `${projectionName}.${commit.aggregateId}`
                  // Prevent parallel processing of commits for the same aggregateId and projection
                  await this.projectionCommitPromises[promiseKey]

                  this.logger.debug(`Starting to process commit ${commit.commitId}`)
                  const promise = processCommit(commit)


                  this.projectionCommitPromises[promiseKey] = promise

                  await promise
                  this.logger.debug(`Completed processing commit ${commit.commitId}`)
                }
              ),
              err => err ? reject(err) : resolve()
            )
          })
        }
      )
    )
  }

  onStreamEvent({eventName, dynamodb: {NewImage: commitRecord}}) {
    switch (eventName) {
      case 'INSERT': {
        const commit = deserializeCommit(commitRecord)
        this.logger.debug(`Received commit from dynamoDB stream. commitId: '${commit.commitId}'`)

        if (this.loaded) {
          this.commitProcessingQueue.push(commit)
        } else {
          this.bufferedStreamCommits.push(commit)
        }
      }
    }
  }

  async queueBufferedCommits() {
    if (this.bufferedStreamCommits.length) {
      this.logger.info(`Queueing ${this.bufferedStreamCommits.length} buffered commits`)
      this.bufferedStreamCommits.forEach(
        commit => this.commitProcessingQueue.push(commit)
      )
    }
  }

  async stop() {
    return this.subscriber.stop()
  }
}

export default Projector
