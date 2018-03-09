const config = require('../config')
const serializeCommit = require('./serializeCommit')

// Warning: Does not ensure consistency

async function batchWriteCommits({
  aggregateType,
  aggregateKey = '@',
  commits,
  tableName = config.tableName,
  startVersion = 1,
} = {}) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  let i = 0
  try {
    while (i < commits.length) {
      const versionOffset = i
      await ddb
        .batchWriteItem({
          RequestItems: {
            [tableName]: await Promise.all(
              commits.slice(i, i + 25).map(async (commit, num) => ({
                PutRequest: {
                  Item: await serializeCommit({
                    aggregateType,
                    aggregateKey,
                    aggregateVersion: startVersion + versionOffset + num,
                    ...commit,
                  }),
                },
              }))
            ),
          },
        })
        .promise()
      i += 25
    }
  } catch (error) {
    throw error
  }
}

module.exports = batchWriteCommits
