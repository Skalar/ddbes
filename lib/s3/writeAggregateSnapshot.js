const defaultConfig = require('../config')

async function writeAggregateSnapshot(
  {
    aggregateType,
    aggregateKey,
    aggregateVersion,
    state,
    upcastersChecksum,
    headCommitTimestamp,
  },
  config = defaultConfig
) {
  const s3 = new config.configuredAWS.S3()
  await s3
    .putObject({
      Bucket: config.snapshotsBucket,
      Key: `${config.snapshotsPrefix}${aggregateType}_${aggregateKey}`,
      Body: JSON.stringify({
        aggregateVersion,
        state,
        upcastersChecksum,
        headCommitTimestamp,
      }),
    })
    .promise()
}

module.exports = writeAggregateSnapshot
