const ddbes = require('../../main')
const AWS = require('aws-sdk')

async function teardown() {
  const s3 = new AWS.S3()
  await ddbes.dynamodb.deleteTable()
  const Bucket = ddbes.config.snapshotsBucket

  let listResult
  do {
    listResult = await s3.listObjects({Bucket}).promise()

    for (const {Key} of listResult.Contents) {
      await s3.deleteObject({Bucket, Key}).promise()
    }
  } while (listResult.IsTruncated)

  return s3.deleteBucket({Bucket}).promise()
}

module.exports = teardown

if (require.main === module) {
  teardown()
}
