import config from '~/lib/config'
import serializeCommit from './serializeCommit'

// Warning: Does not ensure consistency

async function batchWriteCommits(
  aggregateId,
  commits,
  {tableName = config.tableName, startVersion = 1} = {}
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  let i = 0

  while (i < commits.length) {
    await ddb
      .batchWriteItem({
        RequestItems: {
          [tableName]: commits.slice(i, i + 25).map((commit, num) => ({
            PutRequest: {
              Item: serializeCommit({
                aggregateId,
                version: startVersion + num,
                ...commit,
              }),
            },
          })),
        },
      })
      .promise()
    i += 25
  }
}

export default batchWriteCommits
