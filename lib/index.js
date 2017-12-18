import config from './config'

import Aggregate from './Aggregate'
import Projector from './Projector'
import aggregateCommand from './aggregateCommand'

import * as dynamodb from './dynamodb'
import * as s3 from './s3'

export {config, Aggregate, Projector, dynamodb, s3, aggregateCommand}

export default {
  config,

  Aggregate,
  Projector,
  dynamodb,
  s3,
  aggregateCommand,
}
