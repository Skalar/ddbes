const test = require('blue-tape')
const aggregateCommand = require('./aggregateCommand')

test('aggregateCommand | retry', async t => {
  t.plan(2)

  let commmandInvocations = 0
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

  const wrappedCommand = aggregateCommand(myCommand, {
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
  t.equal(
    hydrateInvocations,
    2,
    'aggregate is hydrated before each retry attempt'
  )
})
