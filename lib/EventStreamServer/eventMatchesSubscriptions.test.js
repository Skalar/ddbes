const test = require('blue-tape')
const eventMatchesSubscriptions = require('./eventMatchesSubscriptions')

test('EventStreamServer/eventMatchesSubscriptions', async t => {
  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [{}]),
    'matches when the no filters provided'
  )

  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: 'MySpecificType'},
    ]),
    'matches when the given attribute is equal'
  )

  t.notOk(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: 'MyOtherType'},
    ]),
    'does not match when given attributes are different'
  )

  t.notOk(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: 'MyOtherType'},
    ]),
    'does not match when one given attributes is equal but another is not'
  )

  t.notOk(
    eventMatchesSubscriptions({type: 'MySpecificType', aggregateType: 'Yo'}, [
      {type: 'MySpecificType', aggregateType: 'Mofo'},
    ]),
    'does not match when one given attributes is equal but another is not'
  )

  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType', aggregateType: 'Yo'}, [
      {type: 'MySpecificType', aggregateType: 'Yo'},
    ]),
    'matches when all given attributes are equal'
  )

  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: ['OtherType', 'MySpecificType']},
    ]),
    'matches when one of the attribute values provided as an array is equal'
  )

  t.notOk(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: ['OtherType', 'ThirdType']},
    ]),
    'does not match when none of the attribute values provided as an array is equal'
  )

  t.notOk(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: {regex: '^nothing$'}},
    ]),
    'does not match when the regex provided does not match the event value'
  )

  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: {regexp: '^MySpecific'}},
    ]),
    'matches when the regex provided matches the event value'
  )

  t.ok(
    eventMatchesSubscriptions({type: 'MySpecificType'}, [
      {type: 'A'},
      {type: 'MySpecificType'},
    ]),
    'matches when only one of the provided subscriptions matches'
  )
})
