// test('AggregateWithKey.getparseKeyProperties()', async t => {
//   class TestAggregate extends AggregateWithKey {
//     static keySchema = ['id']
//   }

//   t.throws(
//     () => TestAggregate.getparseKeyProperties({}),
//     /Missing required key property: id/,
//     'throws and error if required key property is omitted'
//   )

//   TestAggregate.keySchema = ['id', {name: 'userId', optional: true}]

//   t.doesNotThrow(
//     () => TestAggregate.getparseKeyProperties({id: 'test'}),
//     /Missing required key property: userId/,
//     'does not throw error when key property marked as optional is omitted'
//   )

//   t.equal(
//     TestAggregate.getparseKeyProperties({id: 'test', userId: 'gudleik'}).string,
//     'test.gudleik',
//     'uses . to separate the key properties by default'
//   )

//   TestAggregate.keyPropSeparator = '+'

//   t.equal(
//     TestAggregate.getparseKeyProperties({id: 'test', userId: 'gudleik'}).string,
//     'test+gudleik',
//     'allows keyPropSeparator to be customized'
//   )

//   TestAggregate.keyPropSeparator = '.'

//   TestAggregate.keySchema = [{name: 'id', value: ({id}) => `_${id}_`}]

//   t.equal(
//     TestAggregate.getparseKeyProperties({id: 'test'}).string,
//     '_test_',
//     'uses key property value function if defined'
//   )
// })
