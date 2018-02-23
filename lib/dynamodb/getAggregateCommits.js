import queryCommits from './queryCommits'
import config from '~/lib/config'
import {dateString} from '~/lib/utils'

function getAggregateCommits({
  minVersion = 1,
  maxVersion = 10 ** config.versionDigits - 1,
  maxTime,
  aggregateKey = '@',
  consistentRead,
  ...rest
} = {}) {
  return queryCommits({
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
    filterExpression: maxTime ? 't <= :maxTime' : null,
    filterVariables: maxTime ? {':maxTime': dateString(maxTime)} : null,
    consistentRead,
    ...rest,
  })
}

export default getAggregateCommits
