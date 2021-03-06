const test = require('blue-tape')
const ddbes = require('../../main')

const {withCleanup} = require('../utils')

const {dynamodb: {batchWriteCommits, getHeadCommit}} = ddbes

test('dynamodb.getHeadCommit()', async t => {
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

    const headCommit = await getHeadCommit()

    t.equal(headCommit.version, 2, 'returns the last commit')
  })
})
