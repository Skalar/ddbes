const test = require('blue-tape')
const ddbes = require('../../main')
const {withCleanup} = require('../utils')
const {EventStreamServer, EventStream, dynamodb} = ddbes
const {getAsyncIterator} = require('iterall')

test('EventStream EventEmitter', async t => {
  const server = new EventStreamServer({port: 8888})

  await withCleanup(async () => {
    const eventStream = new EventStream({
      wsUrl: 'ws://localhost:8888',
      events: [
        {
          aggregateType: {regexp: '^Car'},
          type: ['ItemAdded', 'ItemRemoved'],
        },
      ],
    })

    await dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          committedAt: new Date('2030-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
            },
          ],
        },
      ],
    })

    await new Promise(resolve =>
      eventStream.once('newEvent', event => {
        t.deepEqual(
          event,
          {
            type: 'ItemAdded',
            properties: {name: 'firstItem'},
            aggregateType: 'Cart',
            aggregateKey: '@',
            aggregateVersion: 1,
            commitId: '20300101000000000:Cart:@',
            version: 0,
            active: true,
            committedAt: '2030-01-01T00:00:00.000Z',
          },
          'emits "newEvent" event correctly'
        )
        resolve()
      })
    )
  })

  server.close()
})

test('EventStream AsyncIterator', async t => {
  const server = new EventStreamServer({port: 8888})
  await withCleanup(async () => {
    const eventStream = new EventStream({
      wsUrl: 'ws://localhost:8888',
      events: [
        {
          aggregateType: 'Cart',
        },
      ],
    })
    const iterator = getAsyncIterator(eventStream)

    await dynamodb.batchWriteCommits({
      aggregateType: 'Cart',
      commits: [
        {
          aggregateVersion: 1,
          committedAt: new Date('2030-01-01'),
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'firstItem'},
            },
          ],
        },
        {
          aggregateVersion: 1,
          aggregateType: 'Other',
          events: [{type: 'SomeEvent'}],
        },
        {
          committedAt: new Date('2030-01-02'),
          aggregateVersion: 2,
          events: [
            {
              type: 'ItemAdded',
              properties: {name: 'secondItem'},
            },
            {
              type: 'ItemAdded',
              properties: {name: 'thirdItem'},
            },
          ],
        },
      ],
    })

    t.deepEqual(
      await iterator.next(),
      {
        value: {
          type: 'ItemAdded',
          properties: {name: 'firstItem'},
          aggregateType: 'Cart',
          aggregateKey: '@',
          aggregateVersion: 1,
          commitId: '20300101000000000:Cart:@',
          version: 0,
          active: true,
          committedAt: '2030-01-01T00:00:00.000Z',
        },
        done: false,
      },
      'next() correctly returns the first event'
    )

    t.deepEqual(
      await iterator.next(),
      {
        value: {
          type: 'ItemAdded',
          properties: {name: 'secondItem'},
          aggregateType: 'Cart',
          aggregateKey: '@',
          aggregateVersion: 2,
          commitId: '20300102000000000:Cart:@',
          version: 0,
          active: true,
          committedAt: '2030-01-02T00:00:00.000Z',
        },
        done: false,
      },
      'next() correctly returns the second event'
    )

    t.deepEqual(
      await iterator.next(),
      {
        value: {
          type: 'ItemAdded',
          properties: {name: 'thirdItem'},
          aggregateType: 'Cart',
          aggregateKey: '@',
          aggregateVersion: 2,
          commitId: '20300102000000000:Cart:@',
          version: 0,
          active: true,
          committedAt: '2030-01-02T00:00:00.000Z',
        },
        done: false,
      },
      'next() correctly returns the third event'
    )
  })

  server.close()
})
