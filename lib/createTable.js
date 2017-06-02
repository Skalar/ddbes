import config from './config'
import AWS from 'aws-sdk'
import tableSchema from './tableSchema'

async function createTable({
  name = config.tableName,
  wait = true,
  checkStatusInterval = 500,
  checkStatusAttempts = 20,
  writeCapacityUnits,
  readCapacityUnits,
  logger = config.getLogger('createTable'),
} = {}) {
  const ddb = new (config.AWS || AWS).DynamoDB()

  if (!name) {
    throw new Error('You must provide a name')
  }

  try {
    logger.info(`Creating table '${name}'`)

    await ddb.createTable({
      TableName: name,
      ...tableSchema({readCapacityUnits, writeCapacityUnits})
    }).promise()
  }
  catch (error) {
    if (error.code === 'ResourceInUseException') {
      return {tableWasCreated: false}
    }

    throw error
  }

  if (!wait) return {tableWasCreated: true}

  for (let attempt = 0; attempt <= checkStatusAttempts; attempt++) {
    const {
      Table: {TableStatus}
    } = await ddb.describeTable({TableName: name}).promise()

    switch (TableStatus) {
      case 'ACTIVE': return {tableWasCreated: true}
      case 'CREATING': break
      default: {
        throw new Error('Invalid status ${TableStatus} while waiting for table to be created')
      }
    }

    await new Promise(resolve => setTimeout(resolve, checkStatusInterval))
  }

  throw new Error('Table did not become active within the given time')
}

export default createTable
