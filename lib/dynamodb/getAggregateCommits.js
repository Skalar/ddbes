import queryCommits from './queryCommits'
import config from '~/lib/config'
import {dateString} from '~/lib/utils'

async function getAggregateCommits(
  {
    minVersion = 1,
    maxVersion = 10 ** config.versionDigits - 1,
    maxTime,
    aggregateKey,
    ...rest
  } = {},
  resultHandlerFn
) {
  await queryCommits(
    {
      queryExpression: 'k BETWEEN :fromKeyAndVersion AND :toKeyAndVersion',
      queryVariables: {
        ':fromKeyAndVersion': [
          aggregateKey,
          minVersion.toString().padStart(config.versionDigits, '0'),
        ].join(':'),
        ':toKeyAndVersion': [
          aggregateKey,
          maxVersion.toString().padStart(config.versionDigits, '0'),
        ].join(':'),
      },
      ...rest,
    },
    async (commits, {ConsumedCapacity}) => {
      if (maxTime) {
        const filteredCommits = commits.filter(
          commit => commit.committedAt <= dateString(maxTime)
        )

        if (!filteredCommits.length) return false

        return resultHandlerFn(filteredCommits, {ConsumedCapacity})
      }

      return resultHandlerFn(commits, {ConsumedCapacity})
    }
  )
}

export default getAggregateCommits
