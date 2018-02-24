const defaultConfig = require('../config')

async function readAggregateSnapshot(
  {aggregateType, aggregateKey},
  config = defaultConfig
) {
  const s3 = new config.configuredAWS.S3()

  try {
    const {Body: snapshotJSON} = await s3
      .getObject({
        Bucket: config.snapshotsBucket,
        Key: `${config.snapshotsPrefix}${aggregateType}_${aggregateKey}`,
      })
      .promise()

    return JSON.parse(snapshotJSON)
  } catch (error) {
    if (error.code !== 'NoSuchKey') throw error

    return null
  }
}

module.exports = readAggregateSnapshot
