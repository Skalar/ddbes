import AWS from 'aws-sdk'
import config from '~/lib/config'

function serialize({
  aggregateType,
  aggregateKey,
  commitId,
  events,
  committedAt = new Date(),
  active = 't',
  version = 1,
  versionDigits = config.versionDigits,
}) {
  return AWS.DynamoDB.Converter.marshall({
    aggregateType,
    committedAt: committedAt.toISOString(),
    keyAndVersion: [
      aggregateKey,
      version.toString().padStart(versionDigits, '0'),
    ].join(':'),
    commitId:
      commitId ||
      [
        new Date(committedAt).toISOString().replace(/[^0-9]/g, ''),
        aggregateType,
        aggregateKey,
      ].join(':'),
    events: JSON.stringify(events),
    active,
  })
}

export default serialize
