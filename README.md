# ddbes

DynamoDB Event Store

## WARNING

You should probably not be using this unless you are familiar with event sourcing and willing to read and understand the code.

## Table of contents

* [Installation](#installation)
* [Configuration](#configuration)
* [Example usage](#example-usage)
* [WebSocket event streaming](#websocket-event-streaming)
* [TODO: API docs](#api-docs)
* [Development](#development)

## Installation

```shell
yarn add ddbes
```

## Configuration

Configuration parameters can be

* set via ddbes.config.update()
* static properties on the Aggregate class
* passed to AggregateClass constructor(), static load() or static create()

Configuration parameters:

| Parameter          | Default | Description                                                      |
| ------------------ | ------- | ---------------------------------------------------------------- |
| AWS                |         | configured aws-sdk instance to use                               |
| tableName          | ddbes   | DynamoDB table name to use                                       |
| snapshots          | false   | enable/disble snapshots                                          |
| snapshotsBucket    |         | name of S3 bucket to use for snapshots                           |
| snapshotsPrefix    |         | S3 key prefix for snapshots                                      |
| snapshotsFrequency | 100     | How often snapshots is taken (each _snapshotsFrequency_ commits) |
| logger             |         | logger that supports .debug(), .info(), .warn(), .error()        |

## Example usage

### Setup and teardown of external services

```javascript
import ddbes from 'ddbes'

ddbes.config.update({tableName: 'myapp-commits'})

async function setup() {
  await ddbes.dynamodb.createTable({
    tableReadCapacity: 5,
    tableWriteCapacity: 5,
  })

  await ddbes.dynamodb.setupAutoScaling({
    tableReadMinCapacity: 5,
    tableReadMaxCapacity: 100,
    tableWriteMinCapacity: 5,
    tableWriteMaxCapacity: 100,
    utilizationTargetInPercent: 60,
  })
}

async function teardown() {
  await ddbes.dynamodb.removeAutoScaling()
  await ddbes.dynamodb.deleteTable()
}
```

### Single instance aggregate

```javascript
class ApplicationSettings extends Aggregate {
  static function reducer(state = {}, event, commit) {
    switch (event.type) {
      case 'DebugModeEnabled': {
        return {...state, debugMode: true, updatedAt: commit.committedAt}
      }

      case 'DebugModeDisabled': {
        return {...state, debugMode: false, updatedAt: commit.committedAt}
      }

      default: return state
    }
  }

  enableDebug() {
    return this.commit({type: 'DebugModeEnabled'})
  },

  disableDebug() {
    return this.commit({type: 'DebugModeDisabled'})
  }
}

async function testing() {
  const settings = await ApplicationSettings.load()

  await settings.enableDebug()
  settings.state // {debugMode: true, updatedAt: '.....'}

  const timeWhenDebugWasEnabled = new Date()

  // ... time passes and disableDebug() is run elsewhere

  // refresh aggregate instance from snapshots and store
  await settings.hydrate()

  settings.state.debugMode // false

  const settingsAtVersion1 = ApplicationSettings.load({version: 1})
  settings.state.debugMode // true

  const settingsAtSpecificTime = ApplicationSettings.load({time: timeWhenDebugWasEnabled})
  settings.state.debugMode // true
}
```

### Multi-instance aggregate

aggregates/User.js

```javascript
import {Aggregate} from 'ddbes'

class User extends Aggregate {
  // default
  static keySchema = [{
    name: 'id',
    value: id => id || uuid()
  }]

    changeName(name) {
      return this.commit({type: 'UserNameChanged', name})
    },
  }

  static function reducer(state = {}, event, commit) {
    switch (event.type) {
      case 'Created': {
        const {id, name} = event
        return {...state, id, name, createdAt: commit.committedAt}
      }

      case 'NameChanged': {
        const {name} = event
        return {...state, name, updatedAt: commit.committedAt}
      }

      default: return state
    }
  }

  create({id, name}) {
    return this.commit({type: 'Created', id, name})
  }
}

async function testing() {
  const gudleik = await User.create({name: 'Gudleik'})
  await gudleik.changeName('Gudleika')

  const gudleika = await User.load(gudleik.id)
  await gudleika.changeName('Gudleik')

  gudleika = null

  await gudleik.hydrate()

  gudleik.state.name // Gudleik
}
```

### Attaching externally defined commands to aggregate class

```javascript
import {Aggregate} from 'ddbes'
import * as commands from './commands'

class MyAggregate extends Aggregate {
  // ...
}

Object.assign(MyAggregate.prototype, commands)

export default MyAggregate
```

### Retrying on version conflicts

You can decorate your command functions by using **aggregateCommand()**

```javascript
import {aggregateCommand} from 'ddbes'

async function addItem(name) {
  // ...
  await this.commit({type: 'ItemAdded', name})
}

export default aggregateCommand(myCommand, {retry: true})
```

### Projector

projector.js

```javascript
import {Projector} from 'ddbes'

const projector = new Projector({
  async User({
    // commitId,
    aggregateId,
    events,
    // committedAt,
  }) {
    const [, keyString] = aggregateId.split(':')

    for (const event of events) {
      switch (type) {
        case 'Created': {
          const {name, createdAt} = event

          await elasticsearch.index({
            index: 'myindex',
            type: 'User',
            id: keyString,
            body: {name, createdAt},
          })

          break
        }
        case 'Updated': {
          const {name, updatedAt} = event

          await elasticsearch.update({
            index: 'myindex',
            type: 'User',
            id: keyString,
            body: {
              doc: {name, updatedAt},
            },
          })
          break
        }
      }
    }
  },

  // async ApplicationSettings( ... ) { ... }
})

projector.start({watch: true})
// ... something happens ...
projector.stop()
```

## WebSocket event streaming

### EventStreamServer

Websocket server that polls the event store and sends filtered events to its clients.

```javascript
import {EventStreamServer} from 'ddbes'

const server = new EventStreamServer({port: 80, pollDelay: 100})
```

### EventStream

A client for EventStreamServer that is an event emitter and an AsyncIterator.
Events matching either of the provided filter sets will be sent.

```javascript
const eventStream = new EventStream({
  wsUrl: 'ws://localhost',
  events: [
    {
      aggregateType: 'Cart',
      type: ['ItemAdded', 'ItemRemoved'],
    },
    {
      aggregateType: {regexp: '^Customer.'},
    },
  ],
})
```

## Development

### Running development environment

```shell
docker-compose up
```

This should bring up a local dynamodb and s3, as well as running tests and linting every time the code changes.

Built code is available in dist/.
