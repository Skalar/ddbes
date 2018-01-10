function eventMatchesSubscriptions(event, subscriptions) {
  subscriptions: for (const subscription of subscriptions) {
    filterKeys: for (const filterKey of Object.keys(subscription)) {
      if (Array.isArray(subscription[filterKey])) {
        if (!subscription[filterKey].includes(event[filterKey])) {
          continue subscriptions
        }
      } else if (
        typeof subscription[filterKey] === 'object' &&
        subscription[filterKey].regexp
      ) {
        if (
          !(
            typeof event[filterKey] === 'string' &&
            event[filterKey].match(subscription[filterKey].regexp)
          )
        ) {
          continue subscriptions
        }
      } else if (typeof subscription[filterKey] === 'string') {
        if (event[filterKey] !== subscription[filterKey]) continue subscriptions
      } else {
        continue subscriptions
      }
    }

    // None of the filters have been rejected, so it matches
    return true
  }

  // None of the subscriptions matched
  return false
}

export default eventMatchesSubscriptions
