import ddbes from '~/lib'
import AWS from 'aws-sdk'

async function teardown() {
  const s3 = new AWS.S3()
  await ddbes.dynamodb.deleteTable()

  let listResult
  do {
    listResult = await s3.listObjects({Bucket: 'ddbes-tests'}).promise()

    for (const {Key} of listResult.Contents) {
      await s3.deleteObject({Bucket: 'ddbes-tests', Key}).promise()
    }
  } while (listResult.IsTruncated)

  return s3.deleteBucket({Bucket: 'ddbes-tests'}).promise()
}

export default teardown

if (require.main === module) {
  teardown()
}
