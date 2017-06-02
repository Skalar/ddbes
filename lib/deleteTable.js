import config from './config'
import AWS from 'aws-sdk'

async function deleteTable({
  name = config.tableName,
  wait = true,
  checkStatusInterval = 500,
  checkStatusAttempts = 20,
  logger = config.getLogger('deleteTable'),
} = {}) {
  const ddb = new (config.AWS || AWS).DynamoDB()

  if (!name) {
    throw new Error('You must provide a name')
  }

  try {
    logger.info(`Destroying table '${name}'`)

    await ddb.deleteTable({TableName: name}).promise()

    if (!wait) return {tableWasDestroyed: true}

    for (let attempt = 0; attempt <= checkStatusAttempts; attempt++) {
      const {
        Table: {TableStatus}
      } = await ddb.describeTable({TableName: name}).promise()

      switch (TableStatus) {
        case 'DELETING': break
        default: {
          throw new Error('Invalid status ${TableStatus} while waiting for table to be deleteTableed')
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkStatusInterval))
    }

    throw new Error('Table did not become active within the given time')
  }
  catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      return {tableWasDestroyed: true}
    }

    throw error
  }
}

export default deleteTable
