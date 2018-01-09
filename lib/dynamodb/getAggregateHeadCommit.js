import getAggregateCommits from './getAggregateCommits'

async function getAggregateHeadCommit({aggregateType, aggregateKey}) {
  let commit

  await getAggregateCommits(
    {
      descending: true,
      limit: 1,
      aggregateType,
      aggregateKey,
    },
    commits => {
      commit = commits[0]
    }
  )

  return commit
}

export default getAggregateHeadCommit
