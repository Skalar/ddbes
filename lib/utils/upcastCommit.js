function upcastCommit(commit, upcasters) {
  let upcasted = false

  if (upcasters) {
    const upcastedEvents = commit.events.map(event => {
      let processedEvent = event
      let upcaster
      while (true) {
        const version = processedEvent.version || 0
        upcaster =
          upcasters[processedEvent.type] &&
          upcasters[processedEvent.type][version]

        if (upcaster) {
          upcasted = true
          processedEvent = {
            ...processedEvent,
            properties: upcaster(processedEvent.properties),
            version: version + 1,
          }
        } else {
          break
        }
      }

      return processedEvent
    })

    const upcastedCommit = {...commit, events: upcastedEvents}

    Object.defineProperty(upcastedCommit, 'upcasted', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: upcasted,
    })

    return upcastedCommit
  }

  return commit
}

module.exports = upcastCommit
