const tableSchema = ({
  tableReadCapacity,
  tableWriteCapacity,
  indexReadCapacity,
  indexWriteCapacity,
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
      KeyType: 'HASH',
    },
    {
      AttributeName: 'version',
      KeyType: 'RANGE',
    },
  ],

  ProvisionedThroughput: {
    ReadCapacityUnits: tableReadCapacity,
    WriteCapacityUnits: tableWriteCapacity,
  },

  GlobalSecondaryIndexes: [
    {
      IndexName: 'commitsByCommitId',

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
