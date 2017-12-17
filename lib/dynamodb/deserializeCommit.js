import AWS from 'aws-sdk'

function deserializeCommit(commit) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const [aggregateKeyString, versionString] = unmarshalled.keyAndVersion.split(
    ':'
  )

  const events = JSON.parse(unmarshalled.events)

  const result = {
    aggregateType: unmarshalled.aggregateType,
    aggregateKey: aggregateKeyString ? aggregateKeyString : undefined,
    commitId: unmarshalled.commitId,
    version: parseInt(versionString, 10),
    active: unmarshalled.active,
    events,
    committedAt: new Date(unmarshalled.committedAt),
  }

  return result
}

export default deserializeCommit
