const queryCommits = require('./queryCommits')
const config = require('../config')
const {dateString} = require('../utils')
const storeKeyString = require('./storeKeyString')

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
      ':fromKeyAndVersion': storeKeyString(aggregateKey, minVersion),
      ':toKeyAndVersion': storeKeyString(aggregateKey, maxVersion),
    },
    filterExpression: maxTime ? 't <= :maxTime' : null,
    filterVariables: maxTime ? {':maxTime': dateString(maxTime)} : null,
    consistentRead,
    ...rest,
  })
}

module.exports = getAggregateCommits
