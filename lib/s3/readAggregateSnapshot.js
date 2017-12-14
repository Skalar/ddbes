import defaultConfig from '~/lib/config'

async function readAggregateSnapshot({aggregateId}, config = defaultConfig) {
  const s3 = new config.configuredAWS.S3()

  try {
    const {Body: snapshotJSON} = await s3
      .getObject({
        Bucket: config.snapshotsBucket,
        Key: `${config.snapshotsPrefix}${aggregateId}`,
      })
      .promise()

    return JSON.parse(snapshotJSON)
  } catch (error) {
    if (error.code !== 'NoSuchKey') throw error

    return {state: null, version: 0}
  }
}

export default readAggregateSnapshot
