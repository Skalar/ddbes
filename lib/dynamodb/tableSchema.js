const tableSchema = ({
  tableReadCapacity,
  tableWriteCapacity,
  indexReadCapacity,
  indexWriteCapacity,
}) => ({
  AttributeDefinitions: [
    {
      AttributeName: 'a', // aggregateType
      AttributeType: 'S',
    },
    {
      AttributeName: 'k', // keyAndVersion
      AttributeType: 'S',
    },
    {
      AttributeName: 'c', // commitId
      AttributeType: 'S',
    },
    {
      AttributeName: 'z', // active
      AttributeType: 'S',
    },

    /*
      Other attributes:

      t(S): timestamp for the commit
      e(B): gzip json of events
    */
  ],

  KeySchema: [
    {
      AttributeName: 'a',
      KeyType: 'HASH',
    },
    {
      AttributeName: 'k',
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
          AttributeName: 'z',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'c',
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

module.exports = tableSchema
