import config from './config'
import {asyncify, cargo} from 'async'
import AWS from 'aws-sdk'

class BatchWriter {
  static maxItemsPerRequest = 25

  constructor({tableName = config.tableName} = {}) {
    if (!tableName) {
      throw new Error('tableName must be provided')
    }

    this.ddb = new (config.AWS || AWS).DynamoDB()

    this.queue = cargo(
      asyncify(
        async items => {
          const result = await this.ddb.batchWriteItem({
            RequestItems: {
              [tableName]: items
            }
          }).promise()
          return result
        }
      ),
      this.constructor.maxItemsPerRequest
    )
  }

  putItem({Item}) {
    const promise = new Promise((resolve, reject) => {
      this.queue.push(
        {PutRequest: {Item}},
        (err) => err ? reject(err) : resolve()
      )
    })

    return {promise: () => promise}
  }
}

export default BatchWriter
