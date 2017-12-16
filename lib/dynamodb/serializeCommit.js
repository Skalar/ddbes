import AWS from 'aws-sdk'

function serialize({
  aggregateType,
  aggregateKey,
  commitId,
  events,
  committedAt = new Date(),
  active = 't',
  version = 1,
}) {
  return AWS.DynamoDB.Converter.marshall({
    aggregateType,
    committedAt: committedAt.toISOString(),
    keyAndVersion: [aggregateKey, version].join(':'),
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
