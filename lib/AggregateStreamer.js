import config from './config'
import DynamoDBSubscriber from './dynamodb-subscriber'
import AWS from 'aws-sdk'

class AggregateStreamer {
  aggregates = {}
  bufferedAggregateRecords = {}
  aggregateLoadPromises = {}

  constructor({tableName = config.tableName} = {}) {
    if (!tableName) {
      throw new Error('tableName must be provided')
    }

    this.subscriber = new DynamoDBSubscriber({
      table: tableName,
      aws: config.aws || AWS,
      interval: '1s',
    })

    this.subscriber.on('record', this.onStreamEvent.bind(this))
    this.subscriber.on('error', error => { throw error })
    this.subscriber.start()
  }

  onStreamEvent({eventName, dynamodb: {NewImage: record}}) {
    switch (eventName) {
      case 'INSERT': {
        const {aggregateId: {S: id}} = record

        if (this.bufferedAggregateRecords[id]) {
          this.bufferedAggregateRecords[id].push(record)
        }
        else if (this.aggregates[id]) {
          this.aggregates[id].processCommitRecords([record])
        }
      }
    }
  }

  load(aggregateClass, localId) {
    const id = `${aggregateClass.name}:${localId}`

    // No need to load, we have aggregate already
    if (this.aggregates[id]) return this.aggregates[id]

    // The aggregate is already loading, return load promise
    if (this.aggregateLoadPromises[id]) return this.aggregateLoadPromises[id]

    const promise = (
      async () => {
        // Allocate array for records received while we are loading the aggregate
        this.bufferedAggregateRecords[id] = []

        const aggregate = await aggregateClass.load(localId)

        aggregate.processCommitRecords(
          this.bufferedAggregateRecords[id]
        )
        this.aggregates[id] = aggregate
        delete this.bufferedAggregateRecords[id]

        return aggregate
      }
    )()

    // Store promise so we can return it if another load is requested while
    // already in progress.
    this.aggregateLoadPromises[id] = promise

    return promise
  }

  unload(aggregate) {
    delete this.aggregates[aggregate.id]
    delete this.bufferedAggregateRecords[aggregate.id]
  }

  stop() {
    return this.subscriber.stop()
  }
}

export default AggregateStreamer
