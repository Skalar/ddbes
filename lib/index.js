import config from './config'

import Aggregate from './Aggregate'
import BatchWriter from './BatchWriter'
import Projector from './Projector'
import AggregateWithKey from './AggregateWithKey'
import createTable from './dynamodb/createTable'
import deleteTable from './dynamodb/deleteTable'
import setupAutoScaling from './dynamodb/setupAutoScaling'
import removeAutoScaling from './dynamodb/removeAutoScaling'

export {
  config,
  createTable,
  deleteTable,
  setupAutoScaling,
  removeAutoScaling,
  Aggregate,
  BatchWriter,
  Projector,
  AggregateWithKey,
}

export default {
  config,
  createTable,
  deleteTable,
  setupAutoScaling,
  removeAutoScaling,
  Aggregate,
  BatchWriter,
  Projector,
  AggregateWithKey,
}
