import AWS from 'aws-sdk'

const config = {
  // AWS
  // snapshotsBucket
  // snapshotsPrefix
  tableName: 'ddbes',
  snapshots: false,
  snapshotsFrequency: 100,
  logger: {
    trace() {}, // eslint-disable-line
    debug() {}, // eslint-disable-line
    info() {}, // eslint-disable-line
    warn() {}, // eslint-disable-line
    error() {}, // eslint-disable-line
    fatal() {}, // eslint-disable-line
  },

  get configuredAWS() {
    return this.AWS || AWS
  },

  update(props) {
    Object.assign(this, props)
  },
}

export default config
