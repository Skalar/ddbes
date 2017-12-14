import {retryPromiseWithJitteredBackoff} from './utils'

function aggregateCommand(func, {validation, retry}) {
  return async function decoratedCommand(aggregate, ...args) {
    let argsToUse = args

    if (typeof validation === 'function') {
      const value = await validation(aggregate, ...args)
      argsToUse = [value]
    }

    if (retry) {
      return retryPromiseWithJitteredBackoff(
        () => func(aggregate, ...argsToUse),
        {
          initialDelay: 5,
          maxAttempts: 10,
          shouldRetry: error =>
            error.code === 'ConditionalCheckFailedException',
          beforeRetry: () => aggregate.hydrate(),
          ...(typeof retry === 'object' && retry),
        }
      )
    }

    return func(aggregate, ...argsToUse)
  }
}

export default aggregateCommand
