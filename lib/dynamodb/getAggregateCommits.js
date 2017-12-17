import queryCommits from './queryCommits'

async function getAggregateCommits(
  {minVersion = 1, maxVersion = 999999, maxTime, aggregateKey, ...rest} = {},
  resultHandlerFn
) {
  await queryCommits(
    {
      queryExpression:
        'keyAndVersion BETWEEN :fromKeyAndVersion AND :toKeyAndVersion',
      queryVariables: {
        ':fromKeyAndVersion': [aggregateKey, minVersion].join(':'),
        ':toKeyAndVersion': [aggregateKey, maxVersion].join(':'),
      },
      ...rest,
    },
    async (commits, {ConsumedCapacity}) => {
      if (maxTime) {
        const filteredCommits = commits.filter(
          commit => commit.committedAt <= maxTime
        )

        if (!filteredCommits.length) return false

        return resultHandlerFn(filteredCommits, {ConsumedCapacity})
      }

      return resultHandlerFn(commits, {ConsumedCapacity})
    }
  )
}

export default getAggregateCommits
