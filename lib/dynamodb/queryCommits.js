import config from '../config'
import deserializeCommit from './deserializeCommit'
import serializeCommit from './serializeCommit'
import upcastCommit from '~/lib/utils/upcastCommit'
import {asyncify, eachLimit} from 'async'

async function queryCommits(
  {
    aggregateType,
    consistent = true,
    upcasters = {},
    transform = false,
    queryExpression,
    queryVariables = {},
    transformConcurrency = 10,
    tableName = config.tableName,
  } = {},
  resultHandlerFn
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  let queryResult = {}
  let halted = false

  const query = async () => {
    const {LastEvaluatedKey: ExclusiveStartKey} = queryResult

    queryResult = await ddb
      .query({
        TableName: tableName,
        ...(ExclusiveStartKey && {ExclusiveStartKey}),
        ConsistentRead: consistent,
        KeyConditionExpression: `a = :aggregateType ${
          queryExpression ? `AND ${queryExpression}` : ''
        }`,
        ExpressionAttributeValues: AWS.DynamoDB.Converter.marshall({
          ':aggregateType': aggregateType,
          ...queryVariables,
        }),
      })
      .promise()

    return queryResult
  }

  await query()

  do {
    const {ConsumedCapacity} = queryResult

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
    const [, handlerResult] = await Promise.all([
      transformPromise,
      resultHandlerFn(commits, {ConsumedCapacity}),
      query(),
    ])

    if (handlerResult === false) halted = true
  } while (queryResult.LastEvaluatedKey && !halted)
}

export default queryCommits
