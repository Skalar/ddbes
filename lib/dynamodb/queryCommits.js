import config from '../config'
import deserializeCommit from './deserializeCommit'
import serializeCommit from './serializeCommit'
import upcastCommit from '~/lib/utils/upcastCommit'
import {asyncify, eachLimit} from 'async'

async function* queryCommits(
  {
    aggregateType,
    consistentRead = true,
    upcasters = {},
    transform = false,
    queryExpression,
    queryVariables = {},
    filterExpression,
    filterVariables = {},
    transformConcurrency = 10,
    tableName = config.tableName,
    limit,
    descending = false,
  } = {},
  reportCallback
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()
  let queryTime = 0
  let consumedCapacityUnits = 0
  let queryResult = {}

  const query = async () => {
    const {LastEvaluatedKey: ExclusiveStartKey} = queryResult
    const queryStartedAt = new Date()
    queryResult = await ddb
      .query({
        TableName: tableName,
        ...(ExclusiveStartKey && {ExclusiveStartKey}),
        ConsistentRead: consistentRead,
        KeyConditionExpression: `a = :aggregateType ${
          queryExpression ? `AND ${queryExpression}` : ''
        }`,
        ...(filterExpression && {FilterExpression: filterExpression}),
        ExpressionAttributeValues: AWS.DynamoDB.Converter.marshall({
          ':aggregateType': aggregateType,
          ...queryVariables,
          ...filterVariables,
        }),
        ...(limit && {Limit: limit}),
        ...(descending && {ScanIndexForward: false}),
      })
      .promise()

    queryTime += new Date() - queryStartedAt
    const {ConsumedCapacity} = queryResult
    consumedCapacityUnits += ConsumedCapacity
      ? ConsumedCapacity.CapacityUnits
      : 1

    return queryResult
  }

  await query()

  do {
    let commits = queryResult.Items.map(deserializeCommit)

    if (upcasters) {
      commits = commits.map(commit => upcastCommit(commit, upcasters))
    }

    let transformPromise

    if (transform) {
      transformPromise = new Promise((resolve, reject) => {
        eachLimit(
          commits.filter(commit => commit.upcasted),
          transformConcurrency,
          asyncify(commit =>
            ddb
              .putItem({
                TableName: tableName,
                Item: serializeCommit(commit),
                ReturnValues: 'NONE',
              })
              .promise()
          ),
          err => (err ? reject(err) : resolve())
        )
      })
    }

    for (const commit of commits) {
      yield commit
    }

    await Promise.all([transformPromise, query()])
  } while (queryResult.LastEvaluatedKey)

  if (reportCallback) {
    reportCallback({consumedCapacityUnits, queryTime})
  }
}

export default queryCommits
