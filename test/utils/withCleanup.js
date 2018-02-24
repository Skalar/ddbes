const {clearCommits} = require('../../lib/dynamodb')
const {clearSnapshots} = require('../../lib/s3')

async function withCleanup(fn) {
  try {
    await fn()
  } finally {
    await Promise.all([clearCommits(), clearSnapshots()])
  }
}

module.exports = withCleanup
