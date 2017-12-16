import AWS from 'aws-sdk'

function deserializeCommit(commit, {upcasters} = {}) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const events = JSON.parse(unmarshalled.events)

  if (upcasters) {
    return {
      ...unmarshalled,
      events: events.map(event => {
        let updatedEvent = event
        let upcaster
        while (true) {
          const version = updatedEvent.version || 0
          upcaster =
            upcasters[updatedEvent.type] &&
            upcasters[updatedEvent.type][version]

          if (upcaster) {
            updatedEvent = {...upcaster(updatedEvent), version: version + 1}
          } else {
            break
          }
        }

        return updatedEvent
      }),
    }
  }

  return {...unmarshalled, events}
}

export default deserializeCommit
