import config from '../config'
import deserializeCommit from './deserializeCommit'
import serializeCommit from './serializeCommit'

import {asyncify, eachLimit} from 'async'

async function getAggregateCommits(
  {
    aggregateType,
    aggregateKey,
    minVersion = 1,
    maxVersion = 999999,
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

    return ddb
      .query({
        TableName: config.tableName,
        ...(ExclusiveStartKey && {ExclusiveStartKey}),
        ConsistentRead: true,
        KeyConditionExpression:
          'aggregateType = :aggregateType AND keyAndVersion BETWEEN :fromKeyAndVersion AND :toKeyAndVersion',
        ExpressionAttributeValues: AWS.DynamoDB.Converter.marshall({
          ':aggregateType': aggregateType,
          ':fromKeyAndVersion': [aggregateKey, minVersion].join(':'),
          ':toKeyAndVersion': [aggregateKey, maxVersion].join(':'),
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
