const config = require('../config')

function storeKeyString(aggregateKey, aggregateVersion) {
  return [
    aggregateKey,
    `${'0'.repeat(
      config.versionDigits - aggregateVersion.toString().length
    )}${aggregateVersion}`,
  ].join(':')
}

module.exports = storeKeyString
