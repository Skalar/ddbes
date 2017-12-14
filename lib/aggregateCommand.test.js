import test from 'blue-tape'
import aggregateCommand from './aggregateCommand'

test('aggregateCommand | validation', async t => {
  t.plan(4)
  const aggregate = {}

  {
    let commandInvocations = 0

    const validation = () => {
      throw new Error('Invalid')
    }

    const myCommand = () => commandInvocations++

    const wrappedCommand = aggregateCommand(myCommand, {validation})

    await t.shouldFail(
      wrappedCommand.apply(aggregate),
      /Invalid/,
      'error thrown within validation is not silenced'
    )

    t.equal(
      commandInvocations,
      0,
      'command function is not invoked when validation fails'
    )
  }

  {
    const validation = () => ['Gudleik', 16]

    const addPerson = (...args) => {
      t.pass('command is invoked when validation succeeds')

      t.deepEqual(
        args,
        ['Gudleik', 16],
        'uses arguments returned by validation function to invoke command'
      )
    }

    const wrappedCommand = aggregateCommand(addPerson, {validation})
    wrappedCommand.apply(aggregate)
  }
})

test('aggregateCommand | retry', async t => {
  t.plan(3)

  let commmandInvocations = 0
  let validationInvocations = 0
  let hydrateInvocations = 0

  const aggregate = {
    hydrate() {
      hydrateInvocations++
    },
  }

  const myCommand = function() {
    commmandInvocations++

    if (commmandInvocations < 3) {
      const VersionConflictError = new Error()
      VersionConflictError.code = 'ConditionalCheckFailedException'
      throw VersionConflictError
    }
  }

  const validation = () => {
    validationInvocations++
  }

  const wrappedCommand = aggregateCommand(myCommand, {
    validation,
    retry: {
      initialDelay: 0,
      maxAttempts: 3,
    },
  })

  await wrappedCommand.apply(aggregate)

  t.equal(
    commmandInvocations,
    3,
    'command is retried the specified number of times'
  )
  t.equal(validationInvocations, 3, 'validation is invoked for each attempt')
  t.equal(
    hydrateInvocations,
    2,
    'aggregate is hydrated before each retry attempt'
  )
})
