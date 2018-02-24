const config = require('../config')

async function commit(record) {
  const dynamodb = new config.configuredAWS.DynamoDB()
  return await dynamodb
    .putItem({
      TableName: config.tableName,
      Item: record,
      ConditionExpression: 'attribute_not_exists(k)',
      ReturnValues: 'NONE',
    })
    .promise()
}

module.exports = commit
