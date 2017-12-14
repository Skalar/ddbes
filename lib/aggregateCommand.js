import {retryPromiseWithJitteredBackoff} from './utils'

function aggregateCommand(func, {validation, retry} = {}) {
  return async function decoratedCommand(...args) {
    let argsToUse = args
    let aggregate = this // eslint-disable-line

    async function runWithValidaton() {
      if (typeof validation === 'function') {
        const argsReturnedFromValidation = await validation.apply(
          aggregate,
          args
        )
        argsToUse = argsReturnedFromValidation || args
      }

      return func.apply(aggregate, argsToUse)
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
