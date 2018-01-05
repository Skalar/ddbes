import AWS from 'aws-sdk'
import {gunzipSync} from 'zlib'

function deserializeCommit(commit) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const [aggregateKeyString, versionString] = unmarshalled.keyAndVersion.split(
    ':'
  )

  const events = JSON.parse(gunzipSync(unmarshalled.events))

  const result = {
    aggregateType: unmarshalled.aggregateType,
    aggregateKey: aggregateKeyString ? aggregateKeyString : undefined,
    commitId: unmarshalled.commitId,
    version: parseInt(versionString, 10),
    active: unmarshalled.active === 't',
    committedAt: new Date(unmarshalled.committedAt),
    events,
  }

  return result
}

export default deserializeCommit
