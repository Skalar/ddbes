import AWS from 'aws-sdk'
import config from '~/lib/config'
import {gzipSync} from 'zlib'

function serialize({
  aggregateType,
  aggregateKey,
  commitId,
  events,
  committedAt = new Date(),
  active = true,
  version = 1,
  versionDigits = config.versionDigits,
}) {
  const compressedEventsJSON = gzipSync(JSON.stringify(events))

  return AWS.DynamoDB.Converter.marshall({
    a: aggregateType,
    t: committedAt.toISOString(),
    k: [aggregateKey, version.toString().padStart(versionDigits, '0')].join(
      ':'
    ),
    c:
      commitId ||
      [
        new Date(committedAt).toISOString().replace(/[^0-9]/g, ''),
        aggregateType,
        aggregateKey,
      ].join(':'),
    e: compressedEventsJSON,
    z: active ? 't' : 'f',
  })
}

export default serialize
