import config from '../config'
import deserializeCommit from './deserializeCommit'

async function getAggregateCommits(
  {aggregateId, minVersion = 1, maxVersion, maxTime} = {},
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
            'aggregateId = :aggregateId AND version BETWEEN :minVersion AND :maxVersion',
          ExpressionAttributeValues: AWS.DynamoDB.Converter.marshall({
            ':aggregateId': aggregateId,
            ':minVersion': minVersion,
            ':maxVersion': maxVersion,
          }),
        })
        .promise()
    }

    return ddb
      .query({
        ...commonQueryParams,
        ConsistentRead: true,
        KeyConditionExpression:
          'aggregateId = :aggregateId AND version >= :minVersion',
        ExpressionAttributeValues: AWS.DynamoDB.Converter.marshall({
          ':aggregateId': aggregateId,
          ':minVersion': minVersion,
        }),
      })
      .promise()
  }

  do {
    queryResult = await query()
    if (maxTime) {
      const filteredCommits = queryResult.Items.filter(
        commit => new Date(commit.committedAt.S) <= maxTime
      )
      if (!filteredCommits.length) break

      await resultHandlerFn(filteredCommits.map(deserializeCommit), queryResult)
    } else {
      await resultHandlerFn(
        queryResult.Items.map(deserializeCommit),
        queryResult
      )
    }
  } while (queryResult.LastEvaluatedKey)
}

export default getAggregateCommits
