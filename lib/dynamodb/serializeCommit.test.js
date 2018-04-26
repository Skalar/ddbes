const test = require('blue-tape')
const serializeCommit = require('./serializeCommit')
const {gzipSync} = require('zlib')

test('dynamodb/serializeCommit()', async t => {
  const committedAt = new Date('2017-01-01')

  t.deepEqual(
    await serializeCommit({
      aggregateType: 'TestAggregate',
      committedAt,
      events: [{type: 'SomethingHappened', properties: {eventProp: 'here'}}],
    }),
    {
      z: {S: 't'},
      a: {S: 'TestAggregate'},
      c: {S: '20170101000000000:TestAggregate:@'},
      t: {S: '2017-01-01T00:00:00.000Z'},
      e: {
        B: gzipSync(
          JSON.stringify([{p: {eventProp: 'here'}, t: 'SomethingHappened'}])
        ),
      },
      k: {S: '@:000000001'},
    },
    'correctly serializes commit without key'
  )

  t.deepEqual(
    await serializeCommit({
      aggregateType: 'TestAggregate',
      aggregateKey: 'mykey',
      committedAt,
      events: [{type: 'SomethingHappened', properties: {eventProp: 'here'}}],
    }),
    {
      z: {S: 't'},
      a: {S: 'TestAggregate'},
      c: {S: '20170101000000000:TestAggregate:mykey'},
      t: {S: '2017-01-01T00:00:00.000Z'},
      e: {
        B: gzipSync(
          JSON.stringify([{p: {eventProp: 'here'}, t: 'SomethingHappened'}])
        ),
      },
      k: {S: 'mykey:000000001'},
    },
    'correctly serializes commit with key'
  )
})
