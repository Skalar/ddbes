const AWS = require('aws-sdk')

const noop = () => {
  // do nothing
}

const config = {
  // AWS
  // snapshotsBucket
  // snapshotsPrefix
  tableName: 'ddbes',
  snapshots: false,
  snapshotsFrequency: 100,
  versionDigits: 9,
  logger: {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  },

  get configuredAWS() {
    return this.AWS || AWS
  },

  update(props) {
    Object.assign(this, props)
  },
}

module.exports = config
