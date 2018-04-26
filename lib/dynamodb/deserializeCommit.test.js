const test = require('blue-tape')
const deserializeCommit = require('./deserializeCommit')
const {gzipSync} = require('zlib')

test('dynamodb/deserializeCommit()', async t => {
  const result = await deserializeCommit({
    z: {S: 't'},
    a: {S: 'TestAggregate'},
    c: {S: '20170101000000000:TestAggregate:'},
    t: {S: '2017-01-01T00:00:00.000Z'},
    k: {S: ':000000011'},
    e: {
      B: gzipSync(
        JSON.stringify([{t: 'SomethingHappened', p: {eventProp: 'here'}}])
      ),
    },
  })

  t.deepEqual(
    result,
    {
      active: true,
      aggregateType: 'TestAggregate',
      aggregateKey: undefined,
      commitId: '20170101000000000:TestAggregate:',
      committedAt: '2017-01-01T00:00:00.000Z',
      events: [
        {
          version: 0,
          properties: {eventProp: 'here'},
          type: 'SomethingHappened',
        },
      ],
      aggregateVersion: 11,
    },
    'deserializes the commit correctly'
  )
})
