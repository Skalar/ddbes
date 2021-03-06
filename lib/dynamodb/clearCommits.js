const config = require('../config')

async function clearCommits({tableName = config.tableName} = {}) {
  const ddb = new config.configuredAWS.DynamoDB()
  let queryResult

  while (!queryResult || queryResult.LastEvaluatedKey) {
    queryResult = await ddb
      .scan({
        TableName: tableName,
        ExclusiveStartKey: queryResult
          ? queryResult.LastEvaluatedKey
          : undefined,
      })
      .promise()

    const {Items: items} = queryResult

    let i = 0

    while (i < queryResult.Items.length) {
      await ddb
        .batchWriteItem({
          RequestItems: {
            [tableName]: items.slice(i, i + 25).map(item => ({
              DeleteRequest: {
                Key: {
                  a: item.a,
                  k: item.k,
                },
              },
            })),
          },
        })
        .promise()
      i += 25
    }
  }
}

module.exports = clearCommits
