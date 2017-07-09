import config from './config'
import AWS from 'aws-sdk'
import {asyncify, priorityQueue} from 'async'
import {deserializeCommit} from './utils'

class Projector {
  projectionCommitPromises = {}
  bufferedStreamCommits = []

  constructor(
    projections,
    {
      tableName = config.tableName,
      logger = config.getLogger('projector'),
      pollInterval = 500,
    } = {}
  ) {
    Object.assign(this, {
      pollInterval,
      projections,
      tableName,
      running: false,
      maxQueueBufferSize: 1000,
      minNumberOfCommitsPerQuery: 100,
      maxConcurrency: Math.min(
        Object.values(projections).map(p => p.maxConcurrency)
      ),
      logger,
      commitBuffer: [],
      dynamodb: new (config.AWS || AWS).DynamoDB(),
      exclusiveAggregateTypes: Object.values(projections).reduce(
        (types, projection) => [
          ...types,
          ...projection.exclusiveAggregateTypes.filter(
            type => !types.includes(type)
          ),
        ],
        []
      ),
    })
  }

  async start({poll = true}) {
    this.logger.info(
      `Projector started with poll interval of ${this.pollInterval}ms`
    )

    if (this.running) throw new Error('Already running')
    this.running = true

    const projections = Object.values(this.projections)

    // Verify that all projections are in sync
    const statusList = await Promise.all(
      projections.map(projection => projection.readProjectionStatus())
    )

    if (
      statusList.some(({commitsInProgress}) => commitsInProgress) ||
      new Set(statusList.map(status => status.headCommitId)).size > 1
    ) {
      this.logger.warn(
        'A projection was dirty, clearing all projections and rebuilding..'
      )
      await Promise.all(projections.map(p => p.clearProjection()))
      return this.start({poll})
    }

    this.headCommitId = statusList[0].headCommitId
    if (this.headCommitId) {
      this.logger.info(`Projections are at commitId '${this.headCommitId}'`)
    } else {
      this.logger.info('Projections are empty')
    }

    while (this.running) {
      await this.hydrateCommitQueue()
      const processingBlock = this.getProcessingBlockFromCommitQueue()

      if (!processingBlock.length) {
        await new Promise(resolve => setTimeout(resolve, this.pollInterval))
        continue
      }

      // Remove commits from commit buffer
      this.commitBuffer.splice(0, processingBlock.length)

      await Promise.all([
        this.writeProjectionStatus({
          headCommitId: this.headCommitId,
          processing: true,
        }),
        this.processBlock(processingBlock),
      ])

      this.headCommitId =
        processingBlock[processingBlock.length - 1][0].commitId

      await this.writeProjectionStatus({
        headCommitId: this.headCommitId,
        processing: false,
      })

      this.logger.info(
        `After ${processingBlock.length} commits, projections are now at commitId '${this
          .headCommitId}'`
      )
    }
  }

  writeProjectionStatus(status) {
    return Promise.all(
      Object.values(this.projections).map(projection =>
        projection.writeProjectionStatus(status)
      )
    )
  }

  async stop() {
    // return this.subscriber.stop()
  }

  async fetchCommits({limit = 1000}) {
    let queryResult = {}
    const commits = []
    const currentCommitId = this.commitBuffer.length
      ? this.commitBuffer[this.commitBuffer.length - 1].commitId
      : this.headCommitId || '0'

    this.logger.debug(
      `Fetching ${limit} commits (commitId > ${currentCommitId})`
    )

    do {
      queryResult = await this.dynamodb
        .query({
          TableName: this.tableName,
          IndexName: 'commitsByCommitId',
          KeyConditionExpression: 'active = :a AND commitId > :c',
          ExpressionAttributeValues: {
            ':a': {S: 't'},
            ':c': {
              S: currentCommitId,
            },
          },
          ConsistentRead: true,
          Limit: limit - commits.length,
          ...(queryResult.LastEvaluatedKey && {
            ExclusiveStartKey: queryResult.LastEvaluatedKey,
          }),
        })
        .promise()

      queryResult.Items
        .map(deserializeCommit)
        .forEach(commit => commits.push(commit))
    } while (queryResult.LastEvaluatedKey && commits.length < limit)

    return commits
  }

  async hydrateCommitQueue() {
    const numberOfCommitsToFetch =
      this.maxQueueBufferSize - this.commitBuffer.length

    if (numberOfCommitsToFetch > this.minNumberOfCommitsPerQuery) {
      this.logger.debug(
        `Attempting to hydrating commit buffer with ${numberOfCommitsToFetch} new commits`
      )
      const commits = await this.fetchCommits({limit: numberOfCommitsToFetch})
      if (commits.length) this.logger.debug(`Got ${commits.length} commits`)
      commits.forEach(commit => this.commitBuffer.push(commit))
    }
  }

  getProcessingBlockFromCommitQueue() {
    const block = []
    const aggregateIdCount = {}

    for (const commit of this.commitBuffer) {
      const {aggregateId} = commit
      const [aggregateType] = aggregateId.split(':')

      if (aggregateIdCount[aggregateId]) {
        aggregateIdCount[aggregateId]++
      } else {
        aggregateIdCount[aggregateId] = 1
      }

      if (this.exclusiveAggregateTypes.includes(aggregateType)) {
        return block.length ? block : [commit, 0]
      }

      block.push([commit, aggregateIdCount[aggregateId]])
    }

    return block
  }

  processBlock(block) {
    this.logger.debug(`Process block (commits: ${block.length})`)
    return new Promise((resolve, reject) => {
      const queue = priorityQueue(
        asyncify(commit =>
          Promise.all(
            Object.values(this.projections).map(projection =>
              projection.processCommit(commit)
            )
          )
        ),
        this.maxConcurrency
      )

      queue.error = reject
      queue.drain = resolve
      for (const [commit, priority] of block) {
        queue.push(commit, priority)
      }
    })
  }
}

export default Projector
