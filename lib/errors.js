class ConfigurationError extends Error {
  constructor(...args) {
    super(...args)
    this.name = 'ConfigurationError'

    Error.captureStackTrace(this, ConfigurationError)
  }
}

class BusyCommittingError extends Error {
  constructor(...args) {
    super(...args)
    this.name = 'CommitInProgress'
    Error.captureStackTrace(this, BusyCommittingError)
  }
}

class AggregateNotFoundError extends Error {
  constructor(...args) {
    super(...args)
    this.name = 'AggregateNotFoundError'
    Error.captureStackTrace(this, AggregateNotFoundError)
  }
}

module.exports = {
  AggregateNotFoundError,
  ConfigurationError,
  BusyCommittingError,
}
