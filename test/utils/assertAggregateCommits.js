import {getAggregateCommits} from '~/lib/dynamodb'
import {pick} from 'lodash'

async function assertAggregateCommits(
  t,
  {aggregateType, aggregateKey = '@', commits: providedCommits},
  description = 'the aggregate has the expected commits'
) {
  const actualCommits = []

  for await (const commit of getAggregateCommits({
    aggregateType,
    aggregateKey,
  })) {
    actualCommits.push(commit)
  }

  t.deepEqual(
    actualCommits.map((commit, i) =>
      pick(commit, Object.keys(providedCommits[i] || commit))
    ),
    providedCommits,
    description
  )
}

export default assertAggregateCommits
