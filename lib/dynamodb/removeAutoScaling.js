import config from '../config'

const AWS = config.configuredAWS

async function removeAutoScaling({tableName = config.tableName} = {}) {
  const RoleName = `${tableName}_DDBAutoScalingRole`
  const iam = new AWS.IAM()
  const autoscaling = new AWS.ApplicationAutoScaling()

  const autoScalingTargets = [
    {
      ResourceId: `table/${tableName}`,
      type: 'table',
    },
    {
      ResourceId: `table/${tableName}/index/commitsByCommitId`,
      type: 'index',
    },
  ]

  for (const {ResourceId, type} of autoScalingTargets) {
    try {
      await autoscaling
        .deregisterScalableTarget({
          ResourceId,
          ServiceNamespace: 'dynamodb',
          ScalableDimension: `dynamodb:${type}:ReadCapacityUnits`,
        })
        .promise()

      await autoscaling
        .deregisterScalableTarget({
          ResourceId,
          ServiceNamespace: 'dynamodb',
          ScalableDimension: `dynamodb:${type}:WriteCapacityUnits`,
        })
        .promise()
    } catch (error) {
      if (error.code !== 'ObjectNotFoundException') {
        throw error
      }
    }
  }

  try {
    await iam
      .deleteRolePolicy({
        PolicyName: 'default',
        RoleName,
      })
      .promise()
    await iam
      .deleteRole({
        RoleName,
      })
      .promise()
  } catch (error) {
    if (!['ObjectNotFoundException', 'NoSuchEntity'].includes(error.code)) {
      throw error
    }
  }
}

export default removeAutoScaling
