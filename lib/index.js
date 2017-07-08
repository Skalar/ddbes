import config from './config'

import Aggregate from './Aggregate'
import BatchWriter from './BatchWriter'
import Projector from './Projector'
import AggregateWithKey from './AggregateWithKey'
import createTable from './dynamodb/createTable'
import deleteTable from './dynamodb/deleteTable'

export {
  config,
  createTable,
  deleteTable,
  Aggregate,
  BatchWriter,
  Projector,
  AggregateWithKey,
}

export default {
  config,
  createTable,
  deleteTable,

  Aggregate,
  BatchWriter,
  Projector,
  AggregateWithKey,
}
