import test from 'blue-tape'
import serializeCommit from './serializeCommit'

test('dynamodb/serializeCommit()', async t => {
  const committedAt = new Date('2017-01-01')
  const result = serializeCommit({
    aggregateId: 'TestAggregate',
    committedAt,
    events: [{type: 'SomethingHappened', eventProp: 'here'}],
  })

  t.deepEqual(result, {
    active: {S: 't'},
    aggregateId: {S: 'TestAggregate'},
    commitId: {S: '20170101000000000:TestAggregate'},
    committedAt: {S: '2017-01-01T00:00:00.000Z'},
    events: {S: '[{"type":"SomethingHappened","eventProp":"here"}]'},
    version: {N: '1'},
  })
})
