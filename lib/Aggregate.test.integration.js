import test from 'blue-tape'
import {withCleanup, assertAggregateCommits} from '~/test/utils'
import * as dynamodb from '~/lib/dynamodb'
import * as s3 from '~/lib/s3'

import Aggregate from '~/lib/Aggregate'

class TestAggregate extends Aggregate {
  static commands = {
    addItem(aggregate, name) {
      return aggregate.commit({type: 'ItemAdded', name})
    },
    removeItem(aggregate, name) {
      return aggregate.commit({type: 'ItemRemoved', name})
    },
  }
  static reducer = (state = {items: []}, event) => {
    switch (event.type) {
      case 'ItemAdded': {
        state.items.push(event.name)

        return state
      }
      case 'ItemRemoved': {
        const itemIndex = state.items.indexOf(event.name)

        if (itemIndex !== -1) {
          state.items.splice(itemIndex, 1)
        }

        return state
      }
      default:
        return state
    }
  }
}

test('Aggregate.load()', async t => {
  await withCleanup(async () => {
    await dynamodb.batchWriteCommits('TestAggregate', [
      {
        committedAt: new Date('2017-01-01'),
        events: [
          {
            type: 'ItemAdded',
            name: 'firstItem',
          },
        ],
      },
      {
        committedAt: new Date('2017-01-02'),
        events: [
          {
            type: 'ItemAdded',
            name: 'secondItem',
          },
        ],
      },
      {
        committedAt: new Date('2017-01-03'),
        events: [
          {
            type: 'ItemRemoved',
            name: 'firstItem',
          },
        ],
      },
    ])

    const testAggregate = await TestAggregate.load()

    t.equal(
      testAggregate.aggregateId,
      'TestAggregate',
      'loads the correct aggregateId'
    )

    t.equal(
      testAggregate.version,
      3,
      'loads the latest version given no arguments'
    )

    t.deepEqual(
      testAggregate.state,
      {items: ['secondItem']},
      'correctly reduces the HEAD state given no arguments'
    )

    const testAggregateAtVersion1 = await TestAggregate.load({version: 1})

    t.equal(testAggregateAtVersion1.version, 1, 'loads a given version')

    t.deepEqual(
      testAggregateAtVersion1.state,
      {items: ['firstItem']},
      'correctly reduces the state of a given version'
    )

    const testAggregateAtSpecifiedTime = await TestAggregate.load({
      time: new Date('2017-01-02'),
    })

    t.equal(
      testAggregateAtSpecifiedTime.version,
      2,
      'loads the correct version given time'
    )

    t.deepEqual(
      testAggregateAtSpecifiedTime.state,
      {items: ['firstItem', 'secondItem']},
      'correctly reduces the state at a given time'
    )
  })
})

test('Aggregate#getState', async t => {
  await withCleanup(async () => {
    await dynamodb.batchWriteCommits('TestAggregate', [
      {
        committedAt: new Date('2017-01-01'),
        events: [
          {
            type: 'ItemAdded',
            name: 'firstItem',
          },
        ],
      },
    ])

    const state = await TestAggregate.getState()
    t.deepEqual(
      state,
      {items: ['firstItem']},
      'correctly reduces and returns the HEAD state'
    )
  })
})

test('Aggregate#commit()', async t => {
  await withCleanup(async () => {
    const aggregate = await TestAggregate.load()
    const aggregateCopy = await TestAggregate.load()
    await aggregate.commit({type: 'ItemAdded', name: 'firstItem'})

    await assertAggregateCommits(
      t,
      'TestAggregate',
      [
        {
          version: 1,
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
      ],
      'commits to the store correctly'
    )

    await aggregateCopy.commit(
      {type: 'ItemAdded', name: 'secondItem'},
      {retry: true}
    )

    await assertAggregateCommits(
      t,
      'TestAggregate',
      [
        {
          version: 1,
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
        {
          version: 2,
          events: [{type: 'ItemAdded', name: 'secondItem'}],
        },
      ],
      'retries with hydration when given {retry: true}'
    )
  })
})

test('Aggregate#execute()', async t => {
  await withCleanup(async () => {
    const testAggregate = await TestAggregate.load()

    await testAggregate.execute('addItem', 'firstItem')
    await assertAggregateCommits(
      t,
      'TestAggregate',
      [
        {
          version: 1,
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
      ],
      'has the expected commits after the first command'
    )

    await testAggregate.execute('addItem', 'secondItem')
    await assertAggregateCommits(
      t,
      'TestAggregate',
      [
        {
          version: 1,
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
        {
          version: 2,
          events: [{type: 'ItemAdded', name: 'secondItem'}],
        },
      ],
      'has the expected commits after the second command'
    )

    await testAggregate.removeItem('secondItem')
    await assertAggregateCommits(
      t,
      'TestAggregate',
      [
        {
          version: 1,
          events: [{type: 'ItemAdded', name: 'firstItem'}],
        },
        {
          version: 2,
          events: [{type: 'ItemAdded', name: 'secondItem'}],
        },
        {
          version: 3,
          events: [{type: 'ItemRemoved', name: 'secondItem'}],
        },
      ],
      'is available through convenience mapping directly on the instance'
    )
  })

  // throws a helpful error if the command is not defined
})

test('Aggregate#writeSnapshot()', async t => {
  await withCleanup(async () => {
    const aggregate = await TestAggregate.load()
    await aggregate.addItem('firstItem')
    await aggregate.writeSnapshot()

    const {version, state} = await s3.readAggregateSnapshot({
      aggregateId: 'TestAggregate',
    })
    t.equal(version, 1, 'the snapshot is the correct version')
    t.deepEqual(
      state,
      {items: ['firstItem']},
      'the snapshot has the correct state'
    )
  })
})

test('Aggregate#hydrate()', async t => {
  await withCleanup(async () => {
    const aggregate = await TestAggregate.load()
    const aggregateCopy = await TestAggregate.load()
    await aggregate.addItem('firstItem')
    await aggregateCopy.hydrate()
    t.equal(aggregate.version, 1, 'brings aggregate version up to date')

    t.deepEqual(
      aggregate.state,
      {items: ['firstItem']},
      'brings aggregate state up to date'
    )
  })
})
