import Aggregate from './Aggregate'
import uuid from 'uuid/v4'
import {AggregateNotFound} from './errors'

class AggregateWithKey extends Aggregate {
  static keyProperties = [
    {
      name: 'id',
      defaultValue: () => uuid(),
    },
  ]
}

AggregateWithKey.getKeyFromProps = async function(props) {
  if (typeof props === 'string') return props

  const key = {}
  for (const keyProp of this.keyProperties) {
    const propKey = typeof keyProp === 'string' ? keyProp : keyProp.name

    if (typeof props[propKey] !== 'undefined') {
      key[propKey] = props[propKey]
    } else if (typeof keyProp.defaultValue === 'function') {
      key[propKey] = await keyProp.defaultValue.apply(this, [props])
    } else if (typeof keyProp.defaultValue !== undefined) {
      key[propKey] = keyProp.defaultValue
    }
    // else {
    //   throw new Error(`Empty id property: ${propKey}`)
    // }
  }

  Object.defineProperty(key, 'string', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: Object.values(key).join('.'),
  })

  return key
}

AggregateWithKey.create = async function(props = {}, constructorParams) {
  const key = await this.getKeyFromProps(props)
  const instance = new this({
    aggregateId: `${this.name}:${key.string}`,
    ...constructorParams,
  })

  if (!(instance.create || this.commands || this.commands.create)) {
    throw new Error('The aggregate subclass must implement create()')
  }

  await instance.create({...props, ...key})

  return instance
}

AggregateWithKey._load = AggregateWithKey.load

AggregateWithKey.load = async function(
  keyProps,
  {fail = false, ...constructorParams} = {}
) {
  let keyString, versionParams

  if (typeof keyProps === 'string') {
    keyString = keyProps
  } else {
    const {_time: time, _version: version, ...rest} = keyProps
    versionParams = {time, version}
    keyString = (await this.getKeyFromProps(rest)).string
  }

  const aggregateId = `${this.name}:${keyString}`
  const instance = await this._load({
    ...constructorParams,
    ...versionParams,
    aggregateId,
  })

  if (instance.version > 0) {
    return instance
  }

  if (fail) {
    throw new AggregateNotFound(
      `${this.name} with key '${keyString}' does exist`
    )
  }

  return null
}

AggregateWithKey.loadOrCreate = async function(...args) {
  return (await this.load(...args)) || (await this.create(...args))
}

export default AggregateWithKey
