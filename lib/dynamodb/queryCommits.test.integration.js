import test from 'blue-tape'
import {withCleanup} from '~/test/utils'
import batchWriteCommits from './batchWriteCommits'
import queryCommits from './queryCommits'

test('dynamodb.queryCommits', async t => {
  await withCleanup(async () => {
    await batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          version: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'firstItem',
            },
          ],
        },
        {
          version: 2,
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              name: 'secondItem',
            },
          ],
        },
      ],
    })
    let reportReceived

    const commits = queryCommits(
      {aggregateType: 'Cart'},
      report => (reportReceived = report)
    )

    const commitsReceived = []
    for await (const commit of commits) {
      commitsReceived.push(commit)
    }

    t.deepEqual(
      commitsReceived,
      [
        {
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20170101000000000:Cart:@',
          version: 1,
          active: true,
          committedAt: '2017-01-01T00:00:00.000Z',
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
        {
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20170102000000000:Cart:@',
          version: 2,
          active: true,
          committedAt: '2017-01-02T00:00:00.000Z',
          events: [{type: 'ItemAdded', name: 'secondItem'}],
        },
      ],
      'iterates through all commits'
    )

    t.ok(
      reportReceived.consumedCapacityUnits,
      'reports consumed capacity units'
    )

    t.ok(reportReceived.queryTime, 'reports time spent querying')
  })
})
