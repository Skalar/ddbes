const test = require('blue-tape')
const ddbes = require('../../main')
const {withCleanup} = require('../utils')
const {dynamodb: {batchWriteCommits, queryCommits}} = ddbes

test('dynamodb.queryCommits()', async t => {
  await withCleanup(async () => {
    await batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          aggregateVersion: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
            },
          ],
        },
        {
          aggregateVersion: 2,
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'secondItem'},
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
          aggregateVersion: 1,
          active: true,
          committedAt: '2017-01-01T00:00:00.000Z',
          events: [
            {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
          ],
        },
        {
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20170102000000000:Cart:@',
          aggregateVersion: 2,
          active: true,
          committedAt: '2017-01-02T00:00:00.000Z',
          events: [
            {type: 'ItemAdded', version: 0, properties: {name: 'secondItem'}},
          ],
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
