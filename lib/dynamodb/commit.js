import config from '~/lib/config'

function commit(record) {
  const dynamodb = new config.configuredAWS.DynamoDB()
  return dynamodb
    .putItem({
      TableName: config.tableName,
      Item: record,
      ConditionExpression: 'attribute_not_exists(version)',
      ReturnValues: 'NONE',
    })
    .promise()
}

export default commit
