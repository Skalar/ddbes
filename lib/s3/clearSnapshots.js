const defaultConfig = require('../config')

async function clearSnapshots(config = defaultConfig) {
  const s3 = new config.configuredAWS.S3()

  let listResult

  do {
    listResult = await s3
      .listObjectsV2({
        Bucket: config.snapshotsBucket,
        Prefix: config.snapshotsPrefix,
        ContinuationToken: listResult
          ? listResult.NextContinuationToken
          : undefined,
      })
      .promise()

    for (const {Key} of listResult.Contents) {
      await s3.deleteObject({Bucket: config.snapshotsBucket, Key}).promise()
    }
  } while (listResult.NextContinuationToken)
}

module.exports = clearSnapshots
