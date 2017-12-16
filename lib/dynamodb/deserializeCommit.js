import AWS from 'aws-sdk'

function deserializeCommit(commit, {upcasters} = {}) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const [aggregateKeyString, versionString] = unmarshalled.keyAndVersion.split(
    ':'
  )

  let events = JSON.parse(unmarshalled.events)
  let upcasted = false

  if (upcasters) {
    events = events.map(event => {
      let updatedEvent = event
      let upcaster
      while (true) {
        const version = updatedEvent.version || 0
        upcaster =
          upcasters[updatedEvent.type] && upcasters[updatedEvent.type][version]

        if (upcaster) {
          upcasted = true
          updatedEvent = {...upcaster(updatedEvent), version: version + 1}
        } else {
          break
        }
      }

      return updatedEvent
    })
  }

  const result = {
    aggregateType: unmarshalled.aggregateType,
    aggregateKey: aggregateKeyString ? aggregateKeyString : undefined,
    commitId: unmarshalled.commitId,
    version: parseInt(versionString, 10),
    active: unmarshalled.active,
    events,
    committedAt: new Date(unmarshalled.committedAt),
  }

  Object.defineProperty(result, 'upcasted', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: upcasted,
  })

  return result
}

export default deserializeCommit
