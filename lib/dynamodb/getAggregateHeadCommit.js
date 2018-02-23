import getAggregateCommits from './getAggregateCommits'

async function getAggregateHeadCommit({aggregateType, aggregateKey}) {
  const commits = getAggregateCommits({
    descending: true,
    limit: 1,
    aggregateType,
    aggregateKey,
  })

  const {value: commit} = await commits.next()

  return commit
}

export default getAggregateHeadCommit
