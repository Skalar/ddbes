const test = require('blue-tape')
const ddbes = require('../../main')
const {withCleanup, assertAggregateCommits} = require('../utils')
const {
  batchWriteCommits,
  BatchMutator,
  getAggregateCommits,
  serializeCommit,
  deserializeCommit,
} = ddbes.dynamodb

test('dynamodb.BatchMutator#delete()', async t => {
  await withCleanup(async () => {
    await batchWriteCommits({
      aggregateType: 'Cart',
      commits: Array(30)
        .fill(null)
        .map((_, i) => ({
          aggregateVersion: i + 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: `Item ${i + 1}`},
            },
          ],
        })),
    })
    const mutator = new BatchMutator()
    await mutator.delete(
      getAggregateCommits({aggregateType: 'Cart', minVersion: 2})
    )
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'Item 1'}},
            ],
          },
        ],
      },
      'async iterator yielding commits'
    )
  })
})

test('dynamodb.BatchMutator#put()', async t => {
  async function createCommits() {
    await batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          aggregateVersion: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'Item 1'},
            },
          ],
        },
        {
          aggregateVersion: 2,
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'Item 2'},
            },
          ],
        },
      ],
    })
  }

  await withCleanup(async () => {
    await createCommits()
    const mutator = new BatchMutator()
    await mutator.put(
      (async function*() {
        // nothing
      })()
    )
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'Item 1'}},
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'Item 2'}},
            ],
          },
        ],
      },
      'async iterator yielding no commits'
    )
  })
  await withCleanup(async () => {
    await createCommits()
    async function* updatedCommits() {
      for await (const commit of getAggregateCommits({
        aggregateType: 'Cart',
      })) {
        const events = commit.events.map(event => {
          switch (event.type) {
            case 'ItemAdded': {
              return {
                ...event,
                properties: {name: `${event.properties.name} updated`},
              }
            }
            default:
              return event
          }
        })
        yield {...commit, events}
      }
    }

    const mutator = new BatchMutator()
    await mutator.put(updatedCommits())
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {
                type: 'ItemAdded',
                version: 0,
                properties: {name: 'Item 1 updated'},
              },
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {
                type: 'ItemAdded',
                version: 0,
                properties: {name: 'Item 2 updated'},
              },
            ],
          },
        ],
      },
      'async iterator yielding commits'
    )
  })
  await withCleanup(async () => {
    await createCommits()
    const mutator = new BatchMutator()
    await mutator.put(
      await Promise.all(
        [
          {
            aggregateType: 'Cart',
            aggregateVersion: 1,
            committedAt: new Date('2017-01-01'),
            events: [
              {
                type: 'ItemAdded',
                properties: {name: 'Item 1 updated'},
              },
            ],
          },
        ].map(
          async commit => await deserializeCommit(await serializeCommit(commit))
        )
      )
    )
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {
                type: 'ItemAdded',
                version: 0,
                properties: {name: 'Item 1 updated'},
              },
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'Item 2'}},
            ],
          },
        ],
      },
      'array of commits'
    )
  })
  await withCleanup(async () => {
    await createCommits()
    const mutator = new BatchMutator()
    await mutator.put(
      await deserializeCommit(
        await serializeCommit({
          aggregateType: 'Cart',
          aggregateVersion: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'Item 1 updated'},
            },
          ],
        })
      )
    )
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {
                type: 'ItemAdded',
                version: 0,
                properties: {name: 'Item 1 updated'},
              },
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'Item 2'}},
            ],
          },
        ],
      },
      'single commit'
    )
  })
})
