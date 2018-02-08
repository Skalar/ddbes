import AWS from 'aws-sdk'
import {gunzipSync} from 'zlib'

function deserializeCommit(commit) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const [, aggregateKeyString, versionString] = unmarshalled.k.match(
    /^(.*):([^:]*)$/
  )

  const events = JSON.parse(gunzipSync(unmarshalled.e))

  const result = {
    aggregateType: unmarshalled.a,
    aggregateKey: aggregateKeyString ? aggregateKeyString : undefined,
    commitId: unmarshalled.c,
    version: parseInt(versionString, 10),
    active: unmarshalled.z === 't',
    committedAt: unmarshalled.t,
    events,
  }

  return result
}

export default deserializeCommit
