class ConfigurationError extends Error {
  name = 'ConfigurationError'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, ConfigurationError)
  }
}

class BusyCommittingError extends Error {
  name = 'CommitInProgress'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, BusyCommittingError)
  }
}

class AggregateNotFoundError extends Error {
  name = 'AggregateNotFoundError'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, AggregateNotFoundError)
  }
}

export {AggregateNotFoundError, ConfigurationError, BusyCommittingError}
