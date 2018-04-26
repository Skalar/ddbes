const test = require('blue-tape')
const ddbes = require('../../main')
const {withCleanup, assertAggregateCommits} = require('../utils')
const {Aggregate} = ddbes

class Cart extends Aggregate {
  static reducer(state = {items: []}, event) {
    switch (event.type) {
      case 'Created': {
        const {accountId, storeId} = event.properties
        return {...state, accountId, storeId}
      }
      case 'ItemAdded': {
        state.items.push(event.properties.name)

        return state
      }
      case 'ItemRemoved': {
        const itemIndex = state.items.indexOf(event.properties.name)

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
    return this.commit({type: 'ItemAdded', properties: {name}})
  }

  removeItem(name) {
    return this.commit({type: 'ItemRemoved', properties: {name}})
  }
}

class CartWithKeyProps extends Cart {
  create({accountId, storeId}) {
    return this.commit({type: 'Created', properties: {accountId, storeId}})
  }
}

CartWithKeyProps.keySchema = ['accountId', 'storeId']

test('Aggregate.load() without key', async t => {
  await withCleanup(async () => {
    await ddbes.dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
            },
          ],
        },
        {
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'secondItem'},
            },
          ],
        },
        {
          committedAt: new Date('2017-01-03'),
          events: [
            {
              type: 'ItemRemoved',
              properties: {name: 'firstItem'},
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
    await ddbes.dynamodb.batchWriteCommits({
      aggregateType: 'CartWithKeyProps',
      aggregateKey: '0123.oslo',
      commits: [
        {
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
            },
          ],
        },
        {
          committedAt: new Date('2017-01-02'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'secondItem'},
            },
          ],
        },
        {
          committedAt: new Date('2017-01-03'),
          events: [
            {
              type: 'ItemRemoved',
              properties: {name: 'firstItem'},
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
    await ddbes.dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          committedAt: new Date('2017-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
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
    await aggregate.commit({type: 'ItemAdded', properties: {name: 'firstItem'}})

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
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
      {type: 'ItemAdded', properties: {name: 'secondItem'}},
      {retry: true}
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'secondItem'}},
            ],
          },
        ],
      },
      'retries with hydration when given {retry: true}'
    )
  })

  await withCleanup(async () => {
    const aggregate = await Cart.load()
    await aggregate.commit({
      type: 'ItemAdded',
      properties: {name: new Date('2017-01-01')},
    })

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
                properties: {name: '2017-01-01T00:00:00.000Z'},
                version: 0,
              },
            ],
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

    const {
      aggregateVersion,
      state,
      upcastersChecksum,
    } = await ddbes.s3.readAggregateSnapshot({
      aggregateType: 'Cart',
      aggregateKey: '@',
    })
    t.equal(aggregateVersion, 1, 'the snapshot is the correct version')
    t.deepEqual(
      state,
      {items: ['firstItem']},
      'the snapshot has the correct state'
    )
    t.equal(
      upcastersChecksum,
      undefined,
      'when there are no upcasters defined, the upcastersChecksum is undefined'
    )

    try {
      Cart.upcasters = {
        ItemAdded: {
          0: eventProps => ({name: `_${eventProps.name}_`}),
        },
      }

      await aggregate.writeSnapshot()
      const {upcastersChecksum} = await ddbes.s3.readAggregateSnapshot({
        aggregateType: 'Cart',
        aggregateKey: '@',
      })

      t.equal(
        upcastersChecksum,
        'beNwfZ+Gz+jU2Om5iUdZow==',
        'has upcastersChecksum when upcasters are defined'
      )
    } finally {
      Cart.upcasters = {}
    }
  })
})

test('Aggregate#hydrate()', async t => {
  await withCleanup(async () => {
    {
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

      await aggregate.hydrate()

      t.deepEqual(
        aggregate.state,
        {items: ['firstItem']},
        'hydrate with no new commits does not change anything'
      )
    }
  })

  // Snapshots and requested time/version
  await withCleanup(async () => {
    {
      const aggregate = await Cart.load()

      await ddbes.dynamodb.batchWriteCommits({
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            committedAt: new Date('2018-01-01'),
            events: [
              {
                type: 'ItemAdded',
                properties: {name: 'firstItem'},
              },
            ],
          },
          {
            aggregateVersion: 2,
            committedAt: new Date('2018-01-02'),
            events: [
              {
                type: 'ItemAdded',
                properties: {name: 'secondItem'},
              },
            ],
          },
        ],
      })

      await ddbes.s3.writeAggregateSnapshot({
        aggregateType: 'Cart',
        aggregateKey: '@',
        aggregateVersion: 1,
        state: {items: ['firstItemFromSnapshot']},
        headCommitTimestamp: new Date('2018-01-01'),
      })

      await Cart.commit([
        {
          type: 'ItemAdded',
          properties: {name: 'secondItem'},
        },
      ])

      await aggregate.hydrate({version: 1})

      t.deepEqual(
        aggregate.state,
        {items: ['firstItemFromSnapshot']},
        'specified version: uses snapshot when specific time is after snapshots head commit'
      )

      await aggregate.hydrate({time: new Date('2018-01-01')})

      t.deepEqual(
        aggregate.state,
        {items: ['firstItemFromSnapshot']},
        'specified time: uses snapshot when specific time is after snapshots head commit'
      )

      await ddbes.s3.writeAggregateSnapshot({
        aggregateType: 'Cart',
        aggregateKey: '@',
        aggregateVersion: 2,
        state: {items: ['firstItemFromSnapshot', 'secondItemFromSnapshot']},
        headCommitTimestamp: new Date('2018-01-02'),
      })

      aggregate.reset()
      await aggregate.hydrate({version: 1})

      t.deepEqual(
        aggregate.state,
        {items: ['firstItem']},
        'specified version: does not uses snapshot when it is more recent than requested time'
      )

      aggregate.reset()
      await aggregate.hydrate({time: '2018-01-01T00:00:00.000Z'})

      t.deepEqual(
        aggregate.state,
        {items: ['firstItem']},
        'specified time: does not uses snapshot when it is more recent than requested time'
      )
    }
  })

  // Snapshots and upcasters
  await withCleanup(async () => {
    try {
      Cart.upcasters = {
        ItemAdded: {
          0: eventProps => ({name: `_${eventProps.name}_`}),
        },
      }

      let aggregate = await Cart.load()
      await aggregate.addItem('firstItem')
      await aggregate.writeSnapshot()

      const {state} = await ddbes.s3.readAggregateSnapshot({
        aggregateType: 'Cart',
        aggregateKey: '@',
      })

      t.deepEqual(
        state,
        {items: ['firstItem']},
        'does not rewrite snapshot when upcasters has not changed'
      )

      Cart.upcasters = {
        ItemAdded: {
          0: eventProps => ({name: `_${eventProps.name}_`}),
          1: eventProps => ({name: `*${eventProps.name}*`}),
        },
      }

      aggregate = await Cart.load()

      t.deepEqual(
        (await ddbes.s3.readAggregateSnapshot({
          aggregateType: 'Cart',
          aggregateKey: '@',
        })).state,
        {items: ['*_firstItem_*']},
        'rewrites the snapshot when upcasters has changed'
      )
    } finally {
      Cart.upcasters = {}
    }
  })
})

test('Aggregate.upcasters', async t => {
  await withCleanup(async () => {
    try {
      let aggregate = await Cart.load()
      await aggregate.addItem('firstItem')

      Cart.upcasters = {
        ItemAdded: {
          0: eventProps => ({name: `_${eventProps.name}_`}),
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
          0: eventProps => ({name: `_${eventProps.name}_`}),
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
              aggregateVersion: 1,
              events: [
                {
                  type: 'ItemAdded',
                  properties: {name: '_firstItem_'},
                  version: 1,
                },
              ],
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
            aggregateVersion: 1,
            events: [
              {
                type: 'Created',
                version: 0,
                properties: {accountId: 'myaccount', storeId: 'oslo'},
              },
            ],
          },
        ],
      },
      'commits to the store correctly via create() instance function'
    )
  })
})

test('Aggregate.commit() without key props', async t => {
  await withCleanup(async () => {
    const commit = await Cart.commit([
      {type: 'ItemAdded', properties: {name: 'firstItem'}},
    ])

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
          },
        ],
      },
      'commits correctly to an empty aggregate'
    )

    t.equal(typeof commit, 'object', 'returns a commit')
    t.deepEqual(
      Object.keys(commit),
      [
        'commitId',
        'aggregateType',
        'aggregateKey',
        'aggregateVersion',
        'active',
        'committedAt',
        'events',
      ],
      'the returned commit has the correct attributes'
    )

    await Cart.commit([{type: 'ItemAdded', properties: {name: 'secondItem'}}])

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'secondItem'}},
            ],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )

    await Cart.commit([{type: 'ItemAdded', properties: {name: 'thirdItem'}}])
    await assertAggregateCommits(
      t,
      {
        aggregateType: 'Cart',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'secondItem'}},
            ],
          },
          {
            aggregateVersion: 3,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'thirdItem'}},
            ],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )
  })
})

test('Aggregate.commit() with key props', async t => {
  await withCleanup(async () => {
    await CartWithKeyProps.commit(
      {
        accountId: '0123',
        storeId: 'oslo',
      },
      [{type: 'ItemAdded', properties: {name: 'firstItem'}}]
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'CartWithKeyProps',
        aggregateKey: '0123.oslo',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
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
      [{type: 'ItemAdded', properties: {name: 'secondItem'}}]
    )

    await assertAggregateCommits(
      t,
      {
        aggregateType: 'CartWithKeyProps',
        aggregateKey: '0123.oslo',
        commits: [
          {
            aggregateVersion: 1,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'firstItem'}},
            ],
          },
          {
            aggregateVersion: 2,
            events: [
              {type: 'ItemAdded', version: 0, properties: {name: 'secondItem'}},
            ],
          },
        ],
      },
      'commits correctly to an aggregate with existing commit'
    )
  })
})
