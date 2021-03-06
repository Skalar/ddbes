const deserializeCommit = require('./deserializeCommit')
const config = require('../config')

async function getHeadCommit({tableName = config.tableName} = {}) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  const {Items: [commitRecord]} = await ddb
    .query({
      TableName: tableName,
      IndexName: 'commitIdIndex',
      Limit: 1,
      KeyConditionExpression: 'z = :z',
      ExpressionAttributeValues: {
        ':z': {S: 't'},
      },
      ScanIndexForward: false,
    })
    .promise()

  return commitRecord && deserializeCommit(commitRecord)
}

module.exports = getHeadCommit
