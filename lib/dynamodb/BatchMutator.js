const config = require('../config')
const serializeCommit = require('./serializeCommit')

class BatchMutator {
  constructor({
    tableName = config.tableName,
    AWS = config.configuredAWS,
    maxItemsPerRequest = 25,
    queueSize = maxItemsPerRequest,
  } = {}) {
    Object.assign(this, {
      queueSize,
      maxItemsPerRequest,
      AWS,
      tableName,
      queue: [],
      pendingAddToQueuePromises: [],
      drained: Promise.resolve(),
    })
  }

  asIterable(something) {
    return Array.isArray(something) || something.next ? something : [something]
  }

  async delete(commits) {
    for await (const commit of this.asIterable(commits)) {
      const {a, k} = await serializeCommit(commit)
      await this.addToQueue({DeleteRequest: {Key: {a, k}}})
    }
  }

  async put(commits) {
    for await (const commit of this.asIterable(commits)) {
      await this.addToQueue({PutRequest: {Item: await serializeCommit(commit)}})
    }
  }

  async addToQueue(item) {
    if (this.queue.length >= this.queueSize) {
      await new Promise(resolve => this.pendingAddToQueuePromises.push(resolve))
    }

    this.queue.push(item)

    if (!this.workerLoopRunning) {
      this.workerLoop()
    }
  }

  async workerLoop() {
    let resolveFn

    this.drained = new Promise(resolve => (resolveFn = resolve))
    this.workerLoopRunning = true

    while (this.queue.length) {
      const items = this.queue.splice(0, this.maxItemsPerRequest)

      while (
        this.queue.length <= this.queueSize &&
        this.pendingAddToQueuePromises.length
      ) {
        this.pendingAddToQueuePromises.shift()()
      }

      const ddb = new this.AWS.DynamoDB()

      const {UnprocessedItems} = await ddb
        .batchWriteItem({
          RequestItems: {
            [this.tableName]: items,
          },
        })
        .promise()

      const itemsToRequeue = UnprocessedItems[this.tableName]

      if (itemsToRequeue) {
        this.queue.splice(0, 0, ...itemsToRequeue)
      }
    }
    this.workerLoopRunning = false
    resolveFn()
  }
}

module.exports = BatchMutator
