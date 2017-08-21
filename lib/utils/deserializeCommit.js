function deserializeCommit(commit) {
  return {
    commitId: commit.commitId.S,
    committedAt: new Date(parseInt(commit.committedAt.N, 10)),
    aggregateId: commit.aggregateId.S,
    version: parseInt(commit.version.N, 10),
    events: JSON.parse(commit.events.S)
  }
}

export default deserializeCommit
