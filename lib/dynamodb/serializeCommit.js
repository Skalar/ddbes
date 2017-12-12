import AWS from 'aws-sdk'

function serialize({
  aggregateId,
  commitId,
  events,
  committedAt = new Date(),
  active = 't',
  version = 1,
}) {
  return AWS.DynamoDB.Converter.marshall({
    aggregateId,
    committedAt: committedAt.toISOString(),
    version,
    commitId:
      commitId ||
      [
        new Date(committedAt).toISOString().replace(/[^0-9]/g, ''),
        aggregateId,
      ].join(':'),
    events: JSON.stringify(events),
    active,
  })
}

export default serialize
