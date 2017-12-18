function upcastCommit(commit, upcasters) {
  let upcasted = false

  if (upcasters) {
    const upcastedEvents = commit.events.map(event => {
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

export default upcastCommit
