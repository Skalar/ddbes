import config from '../config'
import deserializeCommit from './deserializeCommit'
import serializeCommit from './serializeCommit'

import {asyncify, eachLimit} from 'async'

async function getAggregateCommits(
  {
    aggregateId,
    minVersion = 1,
    maxVersion,
    maxTime,
    upcasters = {},
    transform = false,
    transformConcurrency = 10,
  } = {},
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
    let commitRecords
    if (maxTime) {
      commitRecords = queryResult.Items.filter(
        commit => new Date(commit.committedAt.S) <= maxTime
      )
      if (!commitRecords.length) break
    } else {
      commitRecords = queryResult.Items
    }
    const commits = commitRecords.map(commit =>
      deserializeCommit(commit, {upcasters})
    )
    if (transform) {
      await new Promise((resolve, reject) => {
        eachLimit(
          commits.filter(commit => commit.upcasted),
          transformConcurrency,
          asyncify(commit =>
            ddb
              .putItem({
                TableName: config.tableName,
                Item: serializeCommit(commit),
                ReturnValues: 'NONE',
              })
              .promise()
          ),
          err => (err ? reject(err) : resolve())
        )
      })
    }
    await resultHandlerFn(commits, queryResult)
  } while (queryResult.LastEvaluatedKey)
}

export default getAggregateCommits
