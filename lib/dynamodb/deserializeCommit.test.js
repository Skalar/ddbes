import test from 'blue-tape'
import deserializeCommit from './deserializeCommit'
import {gzipSync} from 'zlib'

test('dynamodb/deserializeCommit()', async t => {
  const result = deserializeCommit({
    z: {S: 't'},
    a: {S: 'TestAggregate'},
    c: {S: '20170101000000000:TestAggregate:'},
    t: {S: '2017-01-01T00:00:00.000Z'},
    k: {S: ':000000011'},
    e: {B: gzipSync('[{"type":"SomethingHappened","eventProp":"here"}]')},
  })

  t.deepEqual(
    result,
    {
      active: true,
      aggregateType: 'TestAggregate',
      aggregateKey: undefined,
      commitId: '20170101000000000:TestAggregate:',
      committedAt: new Date('2017-01-01'),
      events: [{eventProp: 'here', type: 'SomethingHappened'}],
      version: 11,
    },
    'deserializes the commit correctly'
  )
})
