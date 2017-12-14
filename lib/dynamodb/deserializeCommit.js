import AWS from 'aws-sdk'

function deserializeCommit(commit) {
  const unmarshalled = AWS.DynamoDB.Converter.unmarshall(commit)

  return {...unmarshalled, events: JSON.parse(unmarshalled.events)}
}

export default deserializeCommit
