import test from 'blue-tape'
import parseKeyProperties from './parseKeyProperties'

test('parseKeyProperties()', async t => {
  t.throws(
    () => parseKeyProperties({schema: ['id'], props: {}}),
    /Missing required key property: id/,
    'throws and error if required key property is omitted'
  )

  t.doesNotThrow(
    () =>
      parseKeyProperties({
        schema: ['id', {name: 'userId', optional: true}],
        props: {id: 'test'},
      }),
    /Missing required key property: userId/,
    'does not throw error when key property marked as optional is omitted'
  )

  t.deepEqual(
    parseKeyProperties({
      schema: ['id', {name: 'userId', optional: true}],
      props: {id: 'test', userId: 'gudleik'},
    }),
    {keyString: 'test.gudleik', keyProps: {id: 'test', userId: 'gudleik'}},
    'uses . to separate the key properties by default'
  )

  t.deepEqual(
    parseKeyProperties({
      schema: ['id', {name: 'userId', optional: true}],
      props: {id: 'test', userId: 'gudleik'},
      separator: '+',
    }),
    {keyString: 'test+gudleik', keyProps: {id: 'test', userId: 'gudleik'}},
    'allows keySchemaSeparator to be customized'
  )

  t.deepEqual(
    parseKeyProperties({
      schema: [{name: 'id', value: ({id}) => `_${id}_`}],
      props: {id: 'test'},
    }),
    {keyString: '_test_', keyProps: {id: '_test_'}},
    'uses key property value function if defined'
  )
})
