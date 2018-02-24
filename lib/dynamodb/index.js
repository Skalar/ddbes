const BatchMutator = require('./BatchMutator')
const batchWriteCommits = require('./batchWriteCommits')
const commit = require('./commit')
const clearCommits = require('./clearCommits')
const createTable = require('./createTable')
const deleteTable = require('./deleteTable')
const deserializeCommit = require('./deserializeCommit')
const getAggregateCommits = require('./getAggregateCommits')
const getAggregateHeadCommit = require('./getAggregateHeadCommit')
const getHeadCommit = require('./getHeadCommit')
const removeAutoScaling = require('./removeAutoScaling')
const serializeCommit = require('./serializeCommit')
const setupAutoScaling = require('./setupAutoScaling')
const queryCommits = require('./queryCommits')

module.exports = {
  BatchMutator,
  batchWriteCommits,
  commit,
  clearCommits,
  createTable,
  deleteTable,
  deserializeCommit,
  getAggregateCommits,
  getAggregateHeadCommit,
  getHeadCommit,
  removeAutoScaling,
  serializeCommit,
  setupAutoScaling,
  queryCommits,
}
