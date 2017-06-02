import {noopLogger} from './utils'

const config = {
  // AWS
  // snapshotS3Bucket
  // snapshotS3Prefix
  // tableName
  snapshotsEnabled: false,
  snapshotFrequency: 100,
  getLogger: () => noopLogger,
}

export default config
