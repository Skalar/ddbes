const AWS = require('aws-sdk')
const config = require('../config')
const {gzipSync} = require('zlib')
const {dateString} = require('../utils')

function serializeCommit({
  aggregateType,
  aggregateKey = '@',
  commitId,
  events,
  committedAt = new Date(),
  active = true,
  version = 1,
  versionDigits = config.versionDigits,
}) {
  const compressedEventsJSON = gzipSync(JSON.stringify(events))

  return AWS.DynamoDB.Converter.marshall({
    a: aggregateType,
    t: dateString(committedAt),
    k: [aggregateKey, version.toString().padStart(versionDigits, '0')].join(
      ':'
    ),
    c:
      commitId ||
      [
        dateString(committedAt).replace(/[^0-9]/g, ''),
        aggregateType,
        aggregateKey,
      ].join(':'),
    e: compressedEventsJSON,
    z: active ? 't' : 'f',
  })
}

module.exports = serializeCommit
