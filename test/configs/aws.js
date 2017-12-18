import ddbes from '../../lib'
import AWS from 'aws-sdk'

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION || 'eu-west-1',
})

Object.assign(ddbes.config, {
  tableName: process.env.TABLE_NAME || 'ddbes-tests',
  snapshots: true,
  snapshotsBucket: process.env.BUCKET_NAME,
  snapshotsPrefix: 'snapshots/',
  AWS,
})
