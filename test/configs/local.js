const ddbes = require('../../lib')
const AWS = require('aws-sdk')

AWS.config.update({
  accessKeyId: 'xxx',
  secretAccessKey: 'xxx',
  region: 'eu-west-1',
  dynamodb: {
    endpoint: 'http://dynamodb:8000',
  },
  dynamodbstreams: {
    endpoint: 'http://dynamodb:8000',
  },

  s3ForcePathStyle: true,
  s3: {
    endpoint: 'http://s3:5000',
    sslEnabled: false,
    s3ForcePathStyle: true,
  },
})

Object.assign(ddbes.config, {
  tableName: 'ddbes-tests',
  snapshots: true,
  snapshotsBucket: 'ddbes-tests',
  snapshotsPrefix: 'snapshots/',
  AWS,
})
