import test from 'blue-tape'
import {withCleanup, assertAggregateCommits} from '~/test/utils'
import * as dynamodb from '~/lib/dynamodb'
import * as s3 from '~/lib/s3'

import Aggregate from '~/lib/Aggregate'

class Cart extends Aggregate {
  static reducer = (state = {items: []}, event) => {
    switch (event.type) {
      case 'Created': {
        const {accountId, storeId} = event
        return {...state, accountId, storeId}
      }
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

  addItem(name) {
    return this.commit({type: 'ItemAdded', name})
  }

  removeItem(name) {
    return this.commit({type: 'ItemRemoved', name})
  }
}

class CartWithKeyProps extends Cart {
  static keySchema = ['accountId', 'storeId']

  create({accountId, storeId}) {
    return this.commit({type: 'Created', accountId, storeId})
  }
}

test('Aggregate.load() without key', async t => {
  await withCleanup(async () => {
    await dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
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
      ],
    })

    const testAggregate = await Cart.load()

    t.equal(
      testAggregate.aggregateType,
      'Cart',
      'loads the correct aggregateType'
    )

    t.equal(testAggregate.aggregateKey, '@', 'loads the correct aggregateKey')

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

    const testAggregateAtVersion1 = await Cart.load({
      version: 1,
    })

    t.equal(testAggregateAtVersion1.version, 1, 'loads a given version')

    t.deepEqual(
      testAggregateAtVersion1.state,
      {items: ['firstItem']},
      'correctly reduces the state of a given version'
    )

    const testAggregateAtSpecifiedTime = await Cart.load({
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

test('Aggregate.load() with key', async t => {
  await withCleanup(async () => {
    await dynamodb.batchWriteCommits({
      aggregateType: 'CartWithKeyProps',
      aggregateKey: '0123.oslo',
      commits: [
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
      ],
    })

    const testAggregate = await CartWithKeyProps.load({
      accountId: '0123',
      storeId: 'oslo',
    })

    t.ok(testAggregate instanceof CartWithKeyProps, 'returns an instance')

    t.equal(
      testAggregate.aggregateType,
      'CartWithKeyProps',
      'loads the correct aggregateType'
    )

    t.equal(
      testAggregate.aggregateKey,
      '0123.oslo',
      'loads the correct aggregateKey'
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

    const testAggregateAtVersion1 = await CartWithKeyProps.load({
      accountId: '0123',
      storeId: 'oslo',
      version: 1,
    })

    t.equal(testAggregateAtVersion1.version, 1, 'loads a given version')

    t.deepEqual(
      testAggregateAtVersion1.state,
      {items: ['firstItem']},
      'correctly reduces the state of a given version'
    )

    const testAggregateAtSpecifiedTime = await CartWithKeyProps.load({
      accountId: '0123',
      storeId: 'oslo',
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

test('Aggregate#getState()', async t => {
  await withCleanup(async () => {
    await dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'firstItem',
            },
          ],
        },
      ],
    })

    const state = await Cart.getState()
    t.deepEqual(
      state,
      {items: ['firstItem']},
      'correctly reduces and returns the HEAD state'
    )
  })
})

test('Aggregate#commit()', async t => {
  await withCleanup(async () => {
    const aggregate = await Cart.load()
    const aggregateCopy = await Cart.load()
    await aggregate.commit({type: 'ItemAdded', name: 'firstItem'})

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
        ],
      },
      'commits to the store correctly'
    )

    t.ok(
      aggregate.headCommitId.match(/^\d+\:Cart:@$/),
      'sets the headCommitId property on the aggregate'
    )

    await aggregateCopy.commit(
      {type: 'ItemAdded', name: 'secondItem'},
      {retry: true}
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'secondItem'}],
          },
        ],
      },
      'retries with hydration when given {retry: true}'
    )
  })

  await withCleanup(async () => {
    const aggregate = await Cart.load()
    await aggregate.commit({type: 'ItemAdded', name: new Date('2017-01-01')})

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: '2017-01-01T00:00:00.000Z'}],
          },
        ],
      },
      'serializes objects to json before committing to store'
    )

    t.deepEqual(
      aggregate.state.items,
      ['2017-01-01T00:00:00.000Z'],
      'provides serialized/deserialized versions of objects'
    )
  })
})

test('Aggregate#writeSnapshot()', async t => {
  await withCleanup(async () => {
    const aggregate = await Cart.load()
    await aggregate.addItem('firstItem')
    await aggregate.writeSnapshot()

    const {version, state} = await s3.readAggregateSnapshot({
      aggregateType: 'Cart',
      aggregateKey: '@',
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
    const aggregate = await Cart.load()
    const aggregateCopy = await Cart.load()
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

test('Aggregate.upcasters', async t => {
  await withCleanup(async () => {
    try {
      let aggregate = await Cart.load()
      await aggregate.addItem('firstItem')

      Cart.upcasters = {
        ItemAdded: {
          0: event => ({...event, name: `_${event.name}_`}),
        },
      }

      aggregate = await Cart.load()
      t.deepEqual(
        aggregate.state,
        {items: ['_firstItem_']},
        'specified upcasters are applied'
      )
    } finally {
      Cart.upcasters = {}
    }
  })
})

test('Aggregate.lazyTransformation', async t => {
  await withCleanup(async () => {
    try {
      let aggregate = await Cart.load()
      await aggregate.addItem('firstItem')

      Cart.upcasters = {
        ItemAdded: {
          0: event => ({...event, name: `_${event.name}_`}),
        },
      }

      Cart.lazyTransformation = true
      aggregate = await Cart.load()

      await assertAggregateCommits(
        t,
        {
          aggregateType: 'Cart',
          commits: [
            {
              version: 1,
              events: [{type: 'ItemAdded', name: '_firstItem_', version: 1}],
            },
          ],
        },
        'transforms the store commits with the result of upcasting'
      )
    } finally {
      Cart.upcasters = {}
      Cart.lazyTransformation = false
    }
  })
})

test('Aggregate.create()', async t => {
  await withCleanup(async () => {
    const cart = await CartWithKeyProps.create({
      accountId: 'myaccount',
      storeId: 'oslo',
    })

    t.equal(
      cart.aggregateType,
      'CartWithKeyProps',
      'uses the correct aggregateType'
    )

    t.equal(
      cart.aggregateKey,
      'myaccount.oslo',
      'uses the correct aggregateKey'
    )
    t.equal(cart.version, 1, 'reports the correct version')
    t.deepEqual(
      cart.state,
      {accountId: 'myaccount', storeId: 'oslo', items: []},
      'correctly reduces the state'
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'CartWithKeyProps',
        aggregateKey: 'myaccount.oslo',
        commits: [
          {
            version: 1,
            events: [
              {type: 'Created', accountId: 'myaccount', storeId: 'oslo'},
            ],
          },
        ],
      },
      'commits to the store correctly via create() instance function'
    )
  })
})

test('Aggregate.eachInstance()', async t => {
  await withCleanup(async () => {
    await CartWithKeyProps.eachInstance(async () => {
      t.fail('This should not be called')
    })

    t.pass(
      'does not invoke the async callback and resolve the promise when no commits'
    )

    const storeIds = ['oslo', 'bergen', 'trondheim']

    for (const storeId of storeIds) {
      await dynamodb.batchWriteCommits({
        aggregateType: 'CartWithKeyProps',
        aggregateKey: `myaccount.${storeId}`,
        commits: [
          {
            committedAt: new Date('2017-01-01'),
            events: [
              {
                type: 'Created',
                accountId: 'myaccount',
                storeId,
              },
            ],
          },
          {
            committedAt: new Date('2017-01-01'),
            events: [
              {
                type: 'ItemAdded',
                name: 'test',
              },
            ],
          },
        ],
      })
    }

    const aggregatesProvided = []

    await CartWithKeyProps.eachInstance(async cart => {
      aggregatesProvided.push(cart)
    })

    t.deepEqual(
      aggregatesProvided[0].state,
      {accountId: 'myaccount', storeId: 'bergen', items: ['test']},
      'provides first instance with correct state'
    )

    t.deepEqual(
      aggregatesProvided[1].state,
      {accountId: 'myaccount', storeId: 'oslo', items: ['test']},
      'provides second instance with correct state'
    )

    t.deepEqual(
      aggregatesProvided[2].state,
      {accountId: 'myaccount', storeId: 'trondheim', items: ['test']},
      'provides third instance with correct state'
    )
  })

  test('Aggregate.commit() without key props', async t => {
    const commit = await Cart.commit([{type: 'ItemAdded', name: 'firstItem'}])

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
        ],
      },
      'commits correctly to an empty aggregate'
    )

    t.equal(typeof commit, 'object', 'returns a commit')
    t.deepEqual(
      Object.keys(commit),
      [
        'aggregateType',
        'aggregateKey',
        'commitId',
        'version',
        'active',
        'committedAt',
        'events',
      ],
      'the returned commit has the correct attributes'
    )

    await Cart.commit([{type: 'ItemAdded', name: 'secondItem'}])

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'secondItem'}],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )

    await Cart.commit([{type: 'ItemAdded', name: 'thirdItem'}])
    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
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
            events: [{type: 'ItemAdded', name: 'thirdItem'}],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )
  })

  test('Aggregate.commit() with key props', async t => {
    await CartWithKeyProps.commit(
      {
        accountId: '0123',
        storeId: 'oslo',
      },
      [{type: 'ItemAdded', name: 'firstItem'}]
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'CartWithKeyProps',
        aggregateKey: '0123.oslo',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
        ],
      },
      'commits correctly to an empty aggregate'
    )

    await CartWithKeyProps.commit(
      {
        accountId: '0123',
        storeId: 'oslo',
      },
      [{type: 'ItemAdded', name: 'secondItem'}]
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'CartWithKeyProps',
        aggregateKey: '0123.oslo',
        commits: [
          {
            version: 1,
            events: [{type: 'ItemAdded', name: 'firstItem'}],
          },
          {
            version: 2,
            events: [{type: 'ItemAdded', name: 'secondItem'}],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )
  })
})
