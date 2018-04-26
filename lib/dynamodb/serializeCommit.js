const AWS = require('aws-sdk')
const {promisify = require('promisify-node')} = require('util')
const gzip = promisify(require('zlib').gzip)
const {dateString} = require('../utils')
const storeKeyString = require('./storeKeyString')

async function serializeCommit({
  aggregateType,
  aggregateKey = '@',
  commitId,
  events,
  committedAt = new Date(),
  active = true,
  aggregateVersion = 1,
}) {
  return AWS.DynamoDB.Converter.marshall({
    a: aggregateType,
    t: dateString(committedAt),
    k: storeKeyString(aggregateKey, aggregateVersion),
    c:
      commitId ||
      [
        dateString(committedAt).replace(/[^0-9]/g, ''),
        aggregateType,
        aggregateKey,
      ].join(':'),
    e: await gzip(
      JSON.stringify(
        events.map(({type: t, version: v, properties: p}) => ({
          ...(v && {v}),
          p,
          t,
        }))
      )
    ),
    z: active ? 't' : 'f',
  })
}

module.exports = serializeCommit
