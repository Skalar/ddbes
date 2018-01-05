import test from 'blue-tape'
import serializeCommit from './serializeCommit'
import {gzipSync} from 'zlib'

test('dynamodb/serializeCommit()', async t => {
  const committedAt = new Date('2017-01-01')
  t.deepEqual(
    serializeCommit({
      aggregateType: 'TestAggregate',
      committedAt,
      events: [{type: 'SomethingHappened', eventProp: 'here'}],
    }),
    {
      z: {S: 't'},
      a: {S: 'TestAggregate'},
      c: {S: '20170101000000000:TestAggregate:'},
      t: {S: '2017-01-01T00:00:00.000Z'},
      e: {
        B: gzipSync(
          JSON.stringify([{type: 'SomethingHappened', eventProp: 'here'}])
        ),
      },
      k: {S: ':000000001'},
    },
    'correctly serializes commit without key'
  )

  t.deepEqual(
    serializeCommit({
      aggregateType: 'TestAggregate',
      aggregateKey: 'mykey',
      committedAt,
      events: [{type: 'SomethingHappened', eventProp: 'here'}],
    }),
    {
      z: {S: 't'},
      a: {S: 'TestAggregate'},
      c: {S: '20170101000000000:TestAggregate:mykey'},
      t: {S: '2017-01-01T00:00:00.000Z'},
      e: {
        B: gzipSync(
          JSON.stringify([{type: 'SomethingHappened', eventProp: 'here'}])
        ),
      },
      k: {S: 'mykey:000000001'},
    },
    'correctly serializes commit with key'
  )
})
