const config = require('../config')
const tableSchema = require('./tableSchema')

async function createTable({
  tableName = config.tableName,
  wait = true,
  checkStatusIntervalInMs = 500,
  timeoutInSeconds = 120,
  tableWriteCapacity = 1,
  tableReadCapacity = tableWriteCapacity,
  indexWriteCapacity = tableWriteCapacity,
  indexReadCapacity = tableReadCapacity,

  logger = config.logger,
} = {}) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  if (!tableName) {
    throw new Error('You must provide a tableName')
  }

  try {
    logger.info(`Creating table '${tableName}'`)

    await ddb
      .createTable({
        TableName: tableName,
        ...tableSchema({
          tableWriteCapacity,
          tableReadCapacity,
          indexWriteCapacity,
          indexReadCapacity,
        }),
      })
      .promise()
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      return {tableWasCreated: false}
    }

    throw error
  }

  if (!wait) return {tableWasCreated: true}

  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
  }, timeoutInSeconds * 1000)

  while (!timedOut) {
    const {Table: {TableStatus}} = await ddb
      .describeTable({
        TableName: tableName,
      })
      .promise()

    switch (TableStatus) {
      case 'ACTIVE':
        clearTimeout(timer)
        return {tableWasCreated: true}
      case 'CREATING':
        await new Promise(resolve =>
          setTimeout(resolve, checkStatusIntervalInMs)
        )
        continue
      default: {
        throw new Error(
          'Invalid status ${TableStatus} while waiting for table to be created'
        )
      }
    }
  }

  throw new Error('Table did not become active within the given time')
}

module.exports = createTable
