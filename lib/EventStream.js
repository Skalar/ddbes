import WebSocket from 'ws'
import {$$asyncIterator} from 'iterall'
import {EventEmitter} from 'events'

class EventStream extends EventEmitter {
  constructor({wsUrl, events, ...optionsRest}) {
    super()
    this.setMaxListeners(0)
    this.socket = new WebSocket(wsUrl, optionsRest)
    this.socket.on('open', () => {
      this.socket.send(JSON.stringify(events))
    })
    this.socket.on('message', json => this.emit('newEvent', JSON.parse(json)))
    this.socket.on('error', () => (this.socket = undefined))
    this.socket.on(
      'close',
      () => (this.emit('close'), (this.socket = undefined))
    )
  }

  close() {
    return this.socket && this.socket.close()
  }

  [$$asyncIterator]() {
    const eventStream = this

    const queue = []

    this.socket.on('message', json => queue.push(JSON.parse(json)))
    return {
      async next() {
        while (true) {
          if (!eventStream.socket) {
            return {value: undefined, done: true}
          }

          if (queue.length) {
            return {value: queue.shift(), done: false}
          }

          await Promise.race([
            new Promise(resolve => eventStream.socket.once('message', resolve)),
            new Promise(resolve => eventStream.socket.once('close', resolve)),
            new Promise(resolve => eventStream.socket.once('error', resolve)),
          ])
        }
      },

      async return() {
        eventStream.close()

        return {value: undefined, done: true}
      },

      async throw(error) {
        eventStream.close()

        throw error
      },
    }
  }
}

export default EventStream
