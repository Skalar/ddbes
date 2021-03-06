const config = require('../config')

async function setupAutoScaling({
  tableName = config.tableName,
  tableReadMinCapacity = 1,
  tableReadMaxCapacity = 2,
  tableWriteMinCapacity = 1,
  tableWriteMaxCapacity = 2,
  tableScaleInCooldown = 60,
  tableScaleOutCooldown = 60,
  indexReadMinCapacity = tableReadMinCapacity,
  indexReadMaxCapacity = tableReadMaxCapacity,
  indexWriteMinCapacity = tableWriteMinCapacity,
  indexWriteMaxCapacity = tableWriteMaxCapacity,
  indexScaleInCooldown = tableScaleInCooldown,
  indexScaleOutCooldown = tableScaleOutCooldown,
  utilizationTargetInPercent = 70,
} = {}) {
  const RoleName = `${tableName}_DDBAutoScalingRole`

  const AWS = config.configuredAWS
  const iam = new AWS.IAM()
  const autoscaling = new AWS.ApplicationAutoScaling()

  let role

  const AssumeRolePolicyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'application-autoscaling.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
      },
    ],
  }

  const inlineRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:DescribeTable',
          'dynamodb:UpdateTable',
          'cloudwatch:PutMetricAlarm',
          'cloudwatch:DescribeAlarms',
          'cloudwatch:DeleteAlarms',
        ],
        Resource: '*',
      },
    ],
  }

  try {
    role = await iam
      .createRole({
        AssumeRolePolicyDocument: JSON.stringify(AssumeRolePolicyDocument),
        RoleName,
      })
      .promise()
  } catch (error) {
    if (error.code !== 'EntityAlreadyExists') {
      throw error
    }

    await iam
      .updateAssumeRolePolicy({
        RoleName,
        PolicyDocument: JSON.stringify(AssumeRolePolicyDocument),
      })
      .promise()

    role = await iam.getRole({RoleName}).promise()
  }

  await iam
    .putRolePolicy({
      RoleName,
      PolicyName: 'default',
      PolicyDocument: JSON.stringify(inlineRolePolicy),
    })
    .promise()

  const autoScalingTargets = [
    {
      ResourceId: `table/${tableName}`,
      ScaleInCooldown: tableScaleInCooldown,
      ScaleOutCooldown: tableScaleOutCooldown,
      type: 'table',
      readMin: tableReadMinCapacity,
      readMax: tableReadMaxCapacity,
      writeMin: tableWriteMinCapacity,
      writeMax: tableWriteMaxCapacity,
    },
    {
      ResourceId: `table/${tableName}/index/commitIdIndex`,
      ScaleInCooldown: indexScaleInCooldown,
      ScaleOutCooldown: indexScaleOutCooldown,
      type: 'index',
      readMin: indexReadMinCapacity,
      readMax: indexReadMaxCapacity,
      writeMin: indexWriteMinCapacity,
      writeMax: indexWriteMaxCapacity,
    },
  ]

  const registerTargets = async () => {
    for (const {
      ResourceId,
      readMin,
      readMax,
      writeMin,
      writeMax,
      type,
      ScaleInCooldown,
      ScaleOutCooldown,
    } of autoScalingTargets) {
      await autoscaling
        .registerScalableTarget({
          ServiceNamespace: 'dynamodb',
          ResourceId,
          ScalableDimension: `dynamodb:${type}:ReadCapacityUnits`,
          MinCapacity: readMin,
          MaxCapacity: readMax,
          RoleARN: role.Role.Arn,
        })
        .promise()

      await autoscaling
        .registerScalableTarget({
          ServiceNamespace: 'dynamodb',
          ResourceId,
          ScalableDimension: `dynamodb:${type}:WriteCapacityUnits`,
          MinCapacity: writeMin,
          MaxCapacity: writeMax,
          RoleARN: role.Role.Arn,
        })
        .promise()

      await autoscaling
        .putScalingPolicy({
          ResourceId,
          ServiceNamespace: 'dynamodb',
          ScalableDimension: `dynamodb:${type}:ReadCapacityUnits`,
          PolicyName: `DynamoDBReadCapacityUtilization:${ResourceId}`,
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'DynamoDBReadCapacityUtilization',
            },
            ScaleOutCooldown,
            ScaleInCooldown,
            TargetValue: utilizationTargetInPercent,
          },
        })
        .promise()

      await autoscaling
        .putScalingPolicy({
          ResourceId,
          ServiceNamespace: 'dynamodb',
          ScalableDimension: `dynamodb:${type}:WriteCapacityUnits`,
          PolicyName: `DynamoDBWriteCapacityUtilization:${ResourceId}`,
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'DynamoDBWriteCapacityUtilization',
            },
            ScaleOutCooldown,
            ScaleInCooldown,
            TargetValue: utilizationTargetInPercent,
          },
        })
        .promise()
    }
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await registerTargets()

      return
    } catch (error) {
      if (
        error.code !== 'ValidationException' ||
        !(
          error.message.startsWith('Unable to assume IAM role') ||
          error.message.includes(
            'Reason: The security token included in the request is invalid.'
          )
        )
      ) {
        throw error
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  throw new Error('Exhausted attempts to create scaling policies')
}

module.exports = setupAutoScaling
