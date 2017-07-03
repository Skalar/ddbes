class AggregateNotFound extends Error {
  name = 'AggregateNotFound'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, AggregateNotFound)
  }
}

class VersionConflictExhaustion extends Error {
  name = 'VersionConflictExhaustion'

  constructor(...args) {
    super(...args)
    Error.captureStackTrace(this, VersionConflictExhaustion)
  }
}

export {AggregateNotFound, VersionConflictExhaustion}
