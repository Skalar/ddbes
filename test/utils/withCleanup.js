const {dynamodb: {clearCommits}, s3: {clearSnapshots}} = require('../../main')

async function withCleanup(fn) {
  try {
    await fn()
  } finally {
    await Promise.all([clearCommits(), clearSnapshots()])
  }
}

module.exports = withCleanup
