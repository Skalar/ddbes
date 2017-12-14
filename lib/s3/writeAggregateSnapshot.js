import defaultConfig from '~/lib/config'

async function writeAggregateSnapshot(
  {aggregateId, version, state},
  config = defaultConfig
) {
  const s3 = new config.configuredAWS.S3()

  await s3
    .putObject({
      Bucket: config.snapshotsBucket,
      Key: `${config.snapshotsPrefix}${aggregateId}`,
      Body: JSON.stringify({version, state}),
    })
    .promise()
}

export default writeAggregateSnapshot
