import test from 'blue-tape'
import deserializeCommit from './deserializeCommit'

test('dynamodb/deserializeCommit()', async t => {
  const result = deserializeCommit({
    active: {S: 't'},
    aggregateType: {S: 'TestAggregate'},
    commitId: {S: '20170101000000000:TestAggregate:'},
    committedAt: {S: '2017-01-01T00:00:00.000Z'},
    keyAndVersion: {S: ':1'},
    events: {S: '[{"type":"SomethingHappened","eventProp":"here"}]'},
  })

  t.deepEqual(
    result,
    {
      active: 't',
      aggregateType: 'TestAggregate',
      aggregateKey: undefined,
      commitId: '20170101000000000:TestAggregate:',
      committedAt: new Date('2017-01-01'),
      events: [{eventProp: 'here', type: 'SomethingHappened'}],
      version: 1,
    },
    'deserializes the commit correctly'
  )
})
