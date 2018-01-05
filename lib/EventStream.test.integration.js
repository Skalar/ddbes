import test from 'blue-tape'
import {withCleanup} from '~/test/utils'
import * as dynamodb from '~/lib/dynamodb'
import EventStreamServer from './EventStreamServer'
import EventStream from './EventStream'
import {getAsyncIterator} from 'iterall'

test('EventStream EventEmitter', async t => {
  const server = new EventStreamServer({port: 8888})

  await withCleanup(async () => {
    const eventStream = new EventStream({
      wsUrl: 'ws://localhost:8888',
      subscriptions: [
        {
          aggregateType: 'Cart',
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
              name: 'firstItem',
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
            name: 'firstItem',
            aggregateType: 'Cart',
            aggregateKey: '@',
            commitId: '20300101000000000:Cart:@',
            version: 1,
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
      subscriptions: [
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
          version: 1,
          committedAt: new Date('2030-01-01'),
          events: [
            {
              type: 'ItemAdded',
              name: 'firstItem',
            },
          ],
        },
        {
          version: 1,
          aggregateType: 'Other',
          events: [{type: 'SomeEvent'}],
        },
        {
          committedAt: new Date('2030-01-02'),
          version: 2,
          events: [
            {
              type: 'ItemAdded',
              name: 'secondItem',
            },
            {
              type: 'ItemAdded',
              name: 'thirdItem',
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
          name: 'firstItem',
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20300101000000000:Cart:@',
          version: 1,
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
          name: 'secondItem',
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20300102000000000:Cart:@',
          version: 2,
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
          name: 'thirdItem',
          aggregateType: 'Cart',
          aggregateKey: '@',
          commitId: '20300102000000000:Cart:@',
          version: 2,
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
