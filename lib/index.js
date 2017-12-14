import config from './config'

import Aggregate from './Aggregate'
import AggregateWithKey from './AggregateWithKey'
import Projector from './Projector'
import aggregateCommand from './aggregateCommand'

import * as dynamodb from './dynamodb'
import * as s3 from './s3'

export {
  config,
  Aggregate,
  AggregateWithKey,
  Projector,
  dynamodb,
  s3,
  aggregateCommand,
}

export default {
  config,

  Aggregate,
  AggregateWithKey,
  Projector,
  dynamodb,
  s3,
  aggregateCommand,
}
