import WebSocket from 'ws'
import config from '~/lib/config'
import {deserializeCommit} from '~/lib/dynamodb'

function eventIsSubscribedTo(
  {type, aggregateType, aggregateKey},
  subscriptions
) {
  for (const subscription of subscriptions) {
    if (subscription.type && subscription.type !== type) continue

    if (
      subscription.aggregateType &&
      subscription.aggregateType !== aggregateType
    ) {
      continue
    }

    if (
      subscription.aggregateKey &&
      subscription.aggregateKey !== aggregateKey
    ) {
      continue
    }

    if (
      subscription.aggregateKeyPattern &&
      !aggregateKey.match(new RegExp(subscription.aggregateKeyPattern))
    ) {
      continue
    }

    return true
  }

  return false
}

class EventStreamServer {
  isPolling = false
  clientSubscriptions = {}

  constructor({
    verifyClient,
    port = 80,
    pollDelay = 500,
    tableName = config.tableName,
    dynamodb = new config.configuredAWS.DynamoDB(),
  } = {}) {
    this.logger = config.logger
    this.server = new WebSocket.Server({verifyClient, port})
    this.logger.info(`EventStreamServer: Listening on port ${port}`)
    this.server.on('error', error => this.handleError(error))
    this.server.on('connection', this.handleConnection.bind(this))
    this.server.on('close', this.handleConnection.bind(this))
    Object.assign(this, {pollDelay, tableName, dynamodb})
  }

  handleError(error) {
    this.logger.error(error)
  }

  handleConnection(client) {
    const clientAddress = client._socket.remoteAddress
    this.logger.debug(`EventStreamServer: new client (${clientAddress})`)
    if (!this.isPolling) this.startPolling()

    client.subscriptions = []

    client.on('message', json => {
      this.logger.debug(
        `EventStreamServer: subscriptions for ${clientAddress} set to ${json}`
      )
      client.subscriptions = JSON.parse(json)
    })

    client.on('close', () => {
      this.logger.debug(
        `EventStreamServer: client disconnected (${clientAddress})`
      )
    })
  }

  close() {
    this.server.close()
    this.server = undefined
  }

  async startPolling() {
    this.logger.debug(
      `EventStreamServer: we have clients, started polling (delay: ${
        this.pollDelay
      }ms)`
    )

    this.isPolling = true

    let commitIdCursor = new Date().toISOString().replace(/[^0-9]/g, '')

    while (this.server && this.server.clients.size) {
      const queryResult = await this.dynamodb
        .query({
          TableName: this.tableName,
          IndexName: 'commitIdIndex',
          KeyConditionExpression: 'z = :z AND c > :c',
          ExpressionAttributeValues: {
            ':z': {S: 't'},
            ':c': {
              S: commitIdCursor,
            },
          },
        })
        .promise()

      if (!queryResult.Items.length) {
        await new Promise(resolve => setTimeout(resolve, this.pollDelay))
        continue
      }

      const commits = queryResult.Items.map(deserializeCommit)

      let eventsSentCount = 0

      for (const {events, ...commitRest} of commits) {
        for (const event of events) {
          const decoratedEvent = {...event, ...commitRest}
          let matches = 0
          for (const client of this.server.clients) {
            if (eventIsSubscribedTo(decoratedEvent, client.subscriptions)) {
              matches++
              client.send(JSON.stringify(decoratedEvent))
              eventsSentCount++
            }
          }

          this.logger.trace(
            `EventStreamServer: [${
              decoratedEvent.type
            }] sent to ${matches} clients`
          )
        }
        commitIdCursor = commitRest.commitId
      }

      this.logger.debug(
        `EventStreamServer: processed ${
          commits.length
        } commits and sent ${eventsSentCount} events to clients`
      )
    }

    this.isPolling = false
    this.logger.debug('EventStreamServer: no clients, stopping polling')
  }
}

export default EventStreamServer
