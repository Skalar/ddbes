import {clearCommits} from '~/lib/dynamodb'
import {clearSnapshots} from '~/lib/s3'

async function withCleanup(fn) {
  try {
    await fn()
  } finally {
    await Promise.all([clearCommits(), clearSnapshots()])
  }
}

export default withCleanup
