import {getAggregateCommits} from '~/lib/dynamodb'
import {pick} from 'lodash'

async function assertAggregateCommits(
  t,
  {aggregateType, aggregateKey = '@', commits},
  description = 'the aggregate has the expected commits'
) {
  let storeCommits = []

  await getAggregateCommits({aggregateType, aggregateKey}, newCommits => {
    storeCommits = [...storeCommits, ...newCommits]
  })

  t.deepEqual(
    storeCommits.map((commit, i) =>
      pick(commit, Object.keys(commits[i] || commit))
    ),
    commits,
    description
  )
}

export default assertAggregateCommits
