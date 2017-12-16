import test from 'blue-tape'
import serializeCommit from './serializeCommit'

test('dynamodb/serializeCommit()', async t => {
  const committedAt = new Date('2017-01-01')
  t.deepEqual(
    serializeCommit({
      aggregateType: 'TestAggregate',
      committedAt,
      events: [{type: 'SomethingHappened', eventProp: 'here'}],
    }),
    {
      active: {S: 't'},
      aggregateType: {S: 'TestAggregate'},
      commitId: {S: '20170101000000000:TestAggregate:'},
      committedAt: {S: '2017-01-01T00:00:00.000Z'},
      events: {S: '[{"type":"SomethingHappened","eventProp":"here"}]'},
      keyAndVersion: {S: ':1'},
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
      active: {S: 't'},
      aggregateType: {S: 'TestAggregate'},
      commitId: {S: '20170101000000000:TestAggregate:mykey'},
      committedAt: {S: '2017-01-01T00:00:00.000Z'},
      events: {S: '[{"type":"SomethingHappened","eventProp":"here"}]'},
      keyAndVersion: {S: 'mykey:1'},
    },
    'correctly serializes commit with key'
  )
})
