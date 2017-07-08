const tableSchema = ({
  readCapacityUnits: ReadCapacityUnits = 10,
  writeCapacityUnits: WriteCapacityUnits = 10
}) => ({
  AttributeDefinitions: [
    {
      AttributeName: 'aggregateId',
      AttributeType: 'S',
    },
    {
      AttributeName: 'commitId',
      AttributeType: 'S',
    },
    {
      AttributeName: 'active',
      AttributeType: 'S',
    },
    {
      AttributeName: 'version',
      AttributeType: 'N',
    },
  ],

  KeySchema: [
    {
      AttributeName: 'aggregateId',
      KeyType: 'HASH'
    },
    {
      AttributeName: 'version',
      KeyType: 'RANGE'
    }
  ],

  ProvisionedThroughput: {
    ReadCapacityUnits,
    WriteCapacityUnits
  },

  GlobalSecondaryIndexes: [{
    IndexName: 'commitsByCommitId',

    KeySchema: [
      {
        AttributeName: 'active',
        KeyType: 'HASH'
      },
      {
        AttributeName: 'commitId',
        KeyType: 'RANGE'
      }
    ],

    Projection: {
      ProjectionType: 'ALL'
    },

    ProvisionedThroughput: {
      ReadCapacityUnits,
      WriteCapacityUnits
    }
  }],

  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_IMAGE'
  }
})

export default tableSchema
