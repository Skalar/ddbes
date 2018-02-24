const config = require('../config')

function storeKeyString(aggregateKey, version) {
  return [
    aggregateKey,
    `${'0'.repeat(config.versionDigits - version.toString().length)}${version}`,
  ].join(':')
}

module.exports = storeKeyString
