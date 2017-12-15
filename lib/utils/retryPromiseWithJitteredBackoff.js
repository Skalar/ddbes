function randomIntInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

class RetriesExhaustedError extends Error {
  name = 'RetriesExhaustedError'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, RetriesExhaustedError)
  }
}

async function retryPromiseWithJitteredBackoff(
  fn,
  {
    initialDelay = 1,
    maxAttempts = 10,
    maxDelay = Infinity,
    beforeRetry,
    shouldRetry = () => true,
    backoffExponent = 2,
  } = {}
) {
  const errors = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1 && beforeRetry) {
      await beforeRetry(errors[errors.length - 1], attempt)
    }

    try {
      return await fn(attempt)
    } catch (error) {
      if (!await shouldRetry(error, attempt)) {
        throw error
      }
      errors.push(error)
    }

    const delay = Math.min(
      maxDelay,
      randomIntInRange(0, initialDelay * backoffExponent ** attempt)
    )
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  const exhaustionError = new RetriesExhaustedError(
    `Retries exhausted after ${maxAttempts} attempts`
  )

  exhaustionError.errors = errors

  throw exhaustionError
}

export default retryPromiseWithJitteredBackoff
