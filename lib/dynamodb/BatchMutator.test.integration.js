import test from 'blue-tape'
import {withCleanup, assertAggregateCommits} from '~/test/utils'
import batchWriteCommits from './batchWriteCommits'
import BatchMutator from './BatchMutator'
import getAggregateCommits from './getAggregateCommits'
import serializeCommit from './serializeCommit'
import deserializeCommit from './deserializeCommit'

test('dynamodb.BatchMutator#delete()', async t => {
  await withCleanup(async () => {
    await batchWriteCommits({
      aggregateType: 'Cart',
      commits: Array(30)
        .fill(null)
        .map((_, i) => ({
          version: i + 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: `Item ${i + 1}`,
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
            version: 1,
            events: [{type: 'ItemAdded', name: 'Item 1'}],
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
          version: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'Item 1',
            },
          ],
        },
        {
          version: 2,
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              name: 'Item 2',
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
            version: 1,
            events: [{type: 'ItemAdded', name: 'Item 1'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'Item 2'}],
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
              return {...event, name: `${event.name} updated`}
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
            version: 1,
            events: [{type: 'ItemAdded', name: 'Item 1 updated'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'Item 2 updated'}],
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
      [
        {
          aggregateType: 'Cart',
          version: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'Item 1 updated',
            },
          ],
        },
      ]
        .map(serializeCommit)
        .map(deserializeCommit)
    )
    await mutator.drained

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'Item 1 updated'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'Item 2'}],
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
      deserializeCommit(
        serializeCommit({
          aggregateType: 'Cart',
          version: 1,
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'Item 1 updated',
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
            version: 1,
            events: [{type: 'ItemAdded', name: 'Item 1 updated'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'Item 2'}],
          },
        ],
      },
      'single commit'
    )
  })
})
