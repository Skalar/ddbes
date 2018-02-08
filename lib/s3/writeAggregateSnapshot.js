import defaultConfig from '~/lib/config'

async function writeAggregateSnapshot(
  {aggregateType, aggregateKey, version, state, upcastersChecksum},
  config = defaultConfig
) {
  const s3 = new config.configuredAWS.S3()
  await s3
    .putObject({
      Bucket: config.snapshotsBucket,
      Key: `${config.snapshotsPrefix}${aggregateType}_${aggregateKey}`,
      Body: JSON.stringify({version, state, upcastersChecksum}),
    })
    .promise()
}

export default writeAggregateSnapshot
