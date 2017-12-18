const tableSchema = ({
  tableReadCapacity,
  tableWriteCapacity,
  indexReadCapacity,
  indexWriteCapacity,
}) => ({
  AttributeDefinitions: [
    {
      AttributeName: 'aggregateType',
      AttributeType: 'S',
    },
    {
      AttributeName: 'keyAndVersion',
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
  ],

  KeySchema: [
    {
      AttributeName: 'aggregateType',
      KeyType: 'HASH',
    },
    {
      AttributeName: 'keyAndVersion',
      KeyType: 'RANGE',
    },
  ],

  ProvisionedThroughput: {
    ReadCapacityUnits: tableReadCapacity,
    WriteCapacityUnits: tableWriteCapacity,
  },

  GlobalSecondaryIndexes: [
    {
      IndexName: 'commitIdIndex',

      KeySchema: [
        {
          AttributeName: 'active',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'commitId',
          KeyType: 'RANGE',
        },
      ],

      Projection: {
        ProjectionType: 'ALL',
      },

      ProvisionedThroughput: {
        ReadCapacityUnits: indexReadCapacity,
        WriteCapacityUnits: indexWriteCapacity,
      },
    },
  ],

  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_IMAGE',
  },
})

export default tableSchema
