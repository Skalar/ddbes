const AWS = require('aws-sdk')
const {promisify = require('promisify-node')} = require('util')
const gunzip = promisify(require('zlib').gunzip)

async function deserializeCommit(commit) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)
  const [, aggregateKeyString, aggregateVersionString] = unmarshalled.k.match(
    /^(.*):([^:]*)$/
  )

  const result = {
    commitId: unmarshalled.c,
    aggregateType: unmarshalled.a,
    aggregateKey: aggregateKeyString ? aggregateKeyString : undefined,
    aggregateVersion: parseInt(aggregateVersionString, 10),
    active: unmarshalled.z === 't',
    committedAt: unmarshalled.t,
    events: JSON.parse(await gunzip(unmarshalled.e)).map(
      ({t: type, v: version = 0, p: properties}) => ({
        type,
        version,
        properties,
      })
    ),
  }

  return result
}

module.exports = deserializeCommit
