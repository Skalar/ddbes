import config from '~/lib/config'
import serializeCommit from './serializeCommit'

// Warning: Does not ensure consistency

async function batchWriteCommits(
  {
    aggregateType,
    aggregateKey = '@',
    commits,
    tableName = config.tableName,
    startVersion = 1,
  } = {}
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  let i = 0
  try {
    while (i < commits.length) {
      const versionOffset = i
      await ddb
        .batchWriteItem({
          RequestItems: {
            [tableName]: commits.slice(i, i + 25).map((commit, num) => ({
              PutRequest: {
                Item: serializeCommit({
                  aggregateType,
                  aggregateKey,
                  version: startVersion + versionOffset + num,
                  ...commit,
                }),
              },
            })),
          },
        })
        .promise()
      i += 25
    }
  } catch (error) {
    console.log('fuuuuuuck')
    throw error
  }
}

export default batchWriteCommits
