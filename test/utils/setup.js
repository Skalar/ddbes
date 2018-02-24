#!/usr/bin/env node

const ddbes = require('../../main')
const AWS = require('aws-sdk')

async function setup() {
  await ddbes.dynamodb.createTable({
    readCapacityUnits: 10,
    writeCapacityUnits: 10,
  })

  const s3 = new AWS.S3()
  try {
    await s3.createBucket({Bucket: ddbes.config.snapshotsBucket}).promise()
  } catch (error) {
    if (
      !['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'].includes(error.code)
    ) {
      throw error
    }
  }
}

module.exports = setup

if (require.main === module) {
  setup()
}
