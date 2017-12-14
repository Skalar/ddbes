#!/usr/bin/env node

import ddbes from '~/lib'
import AWS from 'aws-sdk'

async function setup() {
  await ddbes.dynamodb.createTable({
    readCapacityUnits: 10,
    writeCapacityUnits: 10,
  })

  const s3 = new AWS.S3()
  try {
    await s3.createBucket({Bucket: 'ddbes-tests'}).promise()
  } catch (error) {
    if (
      !['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'].includes(error.code)
    ) {
      throw error
    }
  }
}

export default setup

if (require.main === module) {
  setup()
}
