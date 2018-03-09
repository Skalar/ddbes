const test = require('blue-tape')
const ddbes = require('../../main')
const {withCleanup} = require('../utils')
const {Aggregate} = ddbes

class User extends Aggregate {
  static reducer(state = {}, event) {
    switch (event.type) {
      case 'Created':
      case 'NameChanged': {
        const {name} = event.properties
        return {...state, name}
      }
      default:
        return state
    }
  }
}

test('Iterating over aggregate instances with Aggregate.instances', async t => {
  await withCleanup(async () => {
    await ddbes.dynamodb.batchWriteCommits({
      aggregateType: 'User',
      commits: [
        {
          aggregateType: 'User',
          aggregateKey: '1',
          version: '1',
          events: [{type: 'Created', properties: {name: 'First user'}}],
        },
        {
          aggregateType: 'User',
          aggregateKey: '1',
          version: '2',
          events: [{type: 'NameChanged', properties: {name: 'Primero user'}}],
        },
        {
          aggregateType: 'User',
          aggregateKey: '2',
          version: '1',
          events: [{type: 'Created', properties: {name: 'Second user'}}],
        },
      ],
    })

    const usersYielded = []
    for await (const user of User.instances) {
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
})
