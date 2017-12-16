import test from 'blue-tape'
import deserializeCommit from './deserializeCommit'

test('dynamodb/deserializeCommit()', async t => {
  const result = deserializeCommit({
    active: {S: 't'},
    aggregateId: {S: 'TestAggregate'},
    commitId: {S: '20170101000000000:TestAggregate'},
    committedAt: {S: '2017-01-01T00:00:00.000Z'},
    version: {N: '1'},
    events: {S: '[{"type":"SomethingHappened","eventProp":"here"}]'},
  })

  t.deepEqual(
    result,
    {
      active: 't',
      aggregateId: 'TestAggregate',
      commitId: '20170101000000000:TestAggregate',
      committedAt: '2017-01-01T00:00:00.000Z',
      events: [{eventProp: 'here', type: 'SomethingHappened'}],
      version: 1,
    },
    'deserializes the commit correctly'
  )

  const upcasters = {
    Created: {
      0: event => ({...event, phoneNumber: `47${event.phoneNumber}`}),
      1: event => ({...event, phoneNumber: `+${event.phoneNumber}`}),
    },
  }

  t.deepEqual(
    deserializeCommit(
      {
        active: {S: 't'},
        aggregateId: {S: 'TestAggregate'},
        commitId: {S: '20170101000000000:TestAggregate'},
        committedAt: {S: '2017-01-01T00:00:00.000Z'},
        version: {N: '1'},
        events: {S: '[{"type":"Created","phoneNumber":"92200000"}]'},
      },
      {upcasters}
    ),
    {
      active: 't',
      aggregateId: 'TestAggregate',
      commitId: '20170101000000000:TestAggregate',
      committedAt: '2017-01-01T00:00:00.000Z',
      events: [{phoneNumber: '+4792200000', type: 'Created', version: 2}],
      version: 1,
    },
    'supports upcasters'
  )
})
