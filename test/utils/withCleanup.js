import clearCommits from './clearCommits'
import {clearSnapshots} from '~/lib/s3'

async function withCleanup(fn) {
  try {
    await fn()
  } finally {
    await clearCommits()
    await clearSnapshots()
  }
}

export default withCleanup
