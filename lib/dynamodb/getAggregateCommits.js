import config from '../config'
import deserializeCommit from './deserializeCommit'

async function getAggregateCommits(
  {aggregateId, minVersion = 0, maxVersion, maxTime} = {},
  resultHandlerFn
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()
  let queryResult = {}

  const query = () => {
    const {LastEvaluatedKey: ExclusiveStartKey} = queryResult
    const commonQueryParams = {
      TableName: config.tableName,
      ...(ExclusiveStartKey && {ExclusiveStartKey}),
    }

    if (typeof maxVersion !== 'undefined') {
      return ddb
        .query({
          ...commonQueryParams,
          ConsistentRead: true,
          KeyConditionExpression:
            'aggregateId = :a AND version BETWEEN :v AND :v2',
          ExpressionAttributeValues: {
            ':a': {S: aggregateId},
            ':v': {N: minVersion.toString()},
            ':v2': {N: maxVersion.toString()},
          },
        })
        .promise()
    }

    return ddb
      .query({
        ...commonQueryParams,
        ConsistentRead: true,
        KeyConditionExpression: 'aggregateId = :a AND version > :v',
        ExpressionAttributeValues: {
          ':a': {S: aggregateId},
          ':v': {N: minVersion.toString()},
        },
      })
      .promise()
  }

  do {
    queryResult = await query()
    if (maxTime) {
      const filteredCommits = queryResult.Items.filter(
        commit => parseInt(commit.committedAt.N, 10) < maxTime.valueOf()
      )
      if (!filteredCommits.length) break

      await resultHandlerFn(filteredCommits.map(deserializeCommit))
    } else {
      await resultHandlerFn(queryResult.Items.map(deserializeCommit))
    }
  } while (queryResult.LastEvaluatedKey)
}

export default getAggregateCommits
