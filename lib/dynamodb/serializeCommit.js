const AWS = require('aws-sdk')
const {gzipSync} = require('zlib')
const {dateString} = require('../utils')
const storeKeyString = require('./storeKeyString')
function serializeCommit({
  aggregateType,
  aggregateKey = '@',
  commitId,
  events,
  committedAt = new Date(),
  active = true,
  version = 1,
}) {
  const compressedEventsJSON = gzipSync(JSON.stringify(events))

  return AWS.DynamoDB.Converter.marshall({
    a: aggregateType,
    t: dateString(committedAt),
    k: storeKeyString(aggregateKey, version),
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
