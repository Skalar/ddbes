const test = require('blue-tape')
const proxyquire = require('proxyquire')

const fakeDynamodb = {}
const Aggregate = proxyquire('./Aggregate', {'./dynamodb': fakeDynamodb})
const {deserializeCommit, serializeCommit} = require('./dynamodb')

class User extends Aggregate {
  static reducer(state = {}, event) {
    switch (event.type) {
      case 'Created':
      case 'NameChanged': {
        const {name} = event
        return {...state, name}
      }
      default:
        return state
    }
  }
}

test('Aggregate.scanInstances', {timeout: 400}, async t => {
  const commits = [
    {
      aggregateType: 'User',
      aggregateKey: '1',
      version: '1',
      events: [{type: 'Created', name: 'First user'}],
    },
    {
      aggregateType: 'User',
      aggregateKey: '1',
      version: '2',
      events: [{type: 'NameChanged', name: 'Primero user'}],
    },
    {
      aggregateType: 'User',
      aggregateKey: '2',
      version: '1',
      events: [{type: 'Created', name: 'Second user'}],
    },
  ]
  fakeDynamodb.queryCommits = async function*() {
    for (const commit of commits) {
      yield deserializeCommit(serializeCommit(commit))
    }
  }

  const usersYielded = []
  for await (const user of User.scanInstances()) {
    usersYielded.push(user)
  }
  t.equal(usersYielded.length, 2, 'yields the correct number of users')
  t.deepEqual(
    usersYielded[0] && usersYielded[0].state,
    {name: 'Primero user'},
    'yields correct state for the first instance'
  )
  t.deepEqual(
    usersYielded[1] && usersYielded[1].state,
    {name: 'Second user'},
    'yields correct state for the second instance'
  )
})
