import {retryPromiseWithJitteredBackoff} from './utils'
import config from '~/lib/config'

function aggregateCommand(func, {retry} = {}) {
  return async function decoratedCommand(...args) {
    const aggregate = this // eslint-disable-line

    const invocationStartedAt = new Date()
    let timeSpentExecutingCommand = 0

    async function runWithValidaton(attempt) {
      const commandExecutionStartedAt = new Date()

      let result

      try {
        result = await func.apply(aggregate, args)
      } finally {
        timeSpentExecutingCommand += new Date() - commandExecutionStartedAt
      }

      const totalTimeSpent = new Date() - invocationStartedAt

      config.logger.debug(
        {
          totalTimeSpent,
          attempts: attempt,
          timeSpentExecutingCommand,
          aggregateId: aggregate.aggregateId,
          command: func.name,
        },
        `${aggregate.aggregateId} ${
          func.name
        }() completed (${totalTimeSpent}ms)`
      )

      return result
    }

    if (retry) {
      return retryPromiseWithJitteredBackoff(runWithValidaton, {
        initialDelay: 5,
        maxAttempts: 10,
        shouldRetry: error => error.code === 'ConditionalCheckFailedException',
        beforeRetry: () => aggregate.hydrate(),
        ...(typeof retry === 'object' && retry),
      })
    }

    return await runWithValidaton()
  }
}

export default aggregateCommand
