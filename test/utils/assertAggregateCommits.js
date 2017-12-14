import {getAggregateCommits} from '~/lib/dynamodb'
import {pick} from 'lodash'

async function assertAggregateCommits(
  t,
  aggregateId,
  commits,
  description = 'the aggregate has the expected commits'
) {
  let storeCommits = []

  await getAggregateCommits({aggregateId}, newCommits => {
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
