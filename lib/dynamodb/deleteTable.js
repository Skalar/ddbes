import config from '../config'

async function deleteTable(
  {
    tableName = config.tableName,
    wait = true,
    checkStatusIntervalInMs = 500,
    timeoutInSeconds = 60,
    logger = config.getLogger('deleteTable'),
  } = {}
) {
  const AWS = config.configuredAWS
  const ddb = new AWS.DynamoDB()

  if (!tableName) {
    throw new Error('You must provide a tableName')
  }

  let timer

  try {
    logger.info(`Destroying table '${tableName}'`)

    await ddb.deleteTable({TableName: tableName}).promise()

    if (!wait) return {tableWasDestroyed: true}

    let timedOut = false

    timer = setTimeout(() => {
      timedOut = true
    }, timeoutInSeconds * 1000)

    while (!timedOut) {
      const {Table: {TableStatus}} = await ddb
        .describeTable({TableName: tableName})
        .promise()

      switch (TableStatus) {
        case 'DELETING':
          break
        default: {
          throw new Error(
            'Invalid status ${TableStatus} while waiting for table to be deleteTableed'
          )
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkStatusIntervalInMs))
    }

    throw new Error('Table was not destroyed in time')
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      clearTimeout(timer)

      return {tableWasDestroyed: true}
    }

    throw error
  }
}

export default deleteTable
