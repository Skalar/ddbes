import {noopLogger} from './utils'
import AWS from 'aws-sdk'

const config = {
  // AWS
  // snapshotS3Bucket
  // snapshotS3Prefix
  // tableName
  snapshotsEnabled: false,
  snapshotFrequency: 100,
  getLogger: () => noopLogger,

  configuredAWS() {
    return this.AWS || AWS
  },
}

export default config
