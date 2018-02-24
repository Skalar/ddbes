const config = require('./config')
const Aggregate = require('./Aggregate')
const Projector = require('./Projector')
const aggregateCommand = require('./aggregateCommand')
const EventStreamServer = require('./EventStreamServer')
const EventStream = require('./EventStream')

const dynamodb = require('./dynamodb')
const s3 = require('./s3')

module.exports = {
  config,
  Aggregate,
  Projector,
  dynamodb,
  s3,
  aggregateCommand,
  EventStream,
  EventStreamServer,
}
