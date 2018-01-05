import config from './config'

import Aggregate from './Aggregate'
import Projector from './Projector'
import aggregateCommand from './aggregateCommand'
import EventStreamServer from './EventStreamServer'
import EventStream from './EventStream'

import * as dynamodb from './dynamodb'
import * as s3 from './s3'

export {
  config,
  Aggregate,
  Projector,
  dynamodb,
  s3,
  aggregateCommand,
  EventStream,
  EventStreamServer,
}

export default {
  config,

  Aggregate,
  Projector,
  EventStream,
  EventStreamServer,
  dynamodb,
  s3,
  aggregateCommand,
}
