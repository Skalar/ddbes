# ddbes
DynamoDB Event Store

## WARNING WARNING EXPERIMENTAL DO NOT USE..
..unless I told you to, in which case it is TOTALLY fine.

## Installation

```shell
yarn add ddbes
```

## Configuration

Configuration is done on multiple levels:
* Property on ddbes.config
* Static property on the Aggregate class
* Passed to AggregateClass constructor() / static load() / static create()

Configuration parameters:

| Parameter          | Default            | Description                                                   |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| AWS                | undefined          | configured aws-sdk to use                                     |
| snapshotsEnabled   | false              | boolean                                                       |
| snapshotS3Bucket   | undefined          | string                                                        |
| snapshotS3Prefix   | undefined          | string                                                        |
| snapshotFrequency  | 100                | number - a snapshot is taken each *snapshotFrequency* commits |
| getLogger          | name => noopLogger | function that should return the logger to use                 |


## Setup

```javascript
import {createTable, deleteTable} from 'ddbes'

const tableName = 'myapp-commits'

async function setup() {
  await createTable({name: tableName})
}

async function teardown() {
  await deleteTable({name: tableName})
}

```

## Examples

### Single instance aggregate

aggregates/ApplicationSettings.js

```javascript
class ApplicationSettings extends Aggregate {
  static commands = {
    enableDebug() {
      return this.commit({type: 'DebugModeEnabled'})
    },

    disableDebug() {
      return this.commit({type: 'DebugModeDisabled'})
    }
  }

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
}
```

```javascript
import {ApplicationSettings} from './aggregates'

async function doSomething() {
  const settings = await ApplicationSettings.load()
  await settings.enableDebug()

  console.log(settings.state.debugMode) // true

  // ... time passes and someone else runs disableDebug()

  // refresh aggregate instance from snapshots and store
  await settings.hydrate()

  console.log(settings.state.debugMode) // false
}
```

### Multi-instance aggregate

aggregates/User.js

```javascript
import {AggregateWithKey} from 'ddbes'

class User extends AggregateWithKey {
  // default
  static keyProperties = [{
    name: 'id',
    defaultValue: () => uuid()
  }]

  static commands = {
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
```

```javascript
import {User} from './aggregates'

async function doSomething() {
  const gudleik = await User.create({name: 'Gudleik'})
  await gudleik.changeName('Gudleika')

  const gudleika = await User.load(gudleik.id)
  await gudleika.changeName('Gudleik')

  gudleika = null

  await gudleik.hydrate()

  gudleik.state.name // Gudleik
}
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
              doc: {name, updatedAt}
            }
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


### AggregateStreamer

```javascript
import {AggregateStreamer} from 'ddbes'
import {User} from './aggregates'

const streamer = new AggregateStreamer({tableName: 'myapp-commits'})

// on computer A
const user = await streamer.load(User, 'gudleik')
console.log(gudleik.state.name) // Gudleik

// on computer B
const user = await streamer.load(User, 'gudleik')
await user.changeName('Gudleika')

// some milliseconds later on computer A
console.log(gudleik.state.name) // Gudleika
```
