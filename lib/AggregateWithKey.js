import Aggregate from './Aggregate'
import uuid from 'uuid/v4'
import {AggregateNotFound} from './errors'

class AggregateWithKey extends Aggregate {
  static keyProperties = [
    {
      name: 'id',
      value: ({id}) => id || uuid(),
    },
  ]
}

AggregateWithKey.getKeyFromProps = function(props) {
  if (typeof props === 'string') return props

  const key = this.keyProperties.reduce((key, keyProp) => {
    const propKey = typeof keyProp === 'string' ? keyProp : keyProp.name

    if (typeof keyProp.value === 'function') {
      return {...key, [propKey]: keyProp.value(props)}
    }

    if (props[propKey] != null || keyProp.optional) {
      return {...key, [propKey]: props[propKey]}
    }

    throw new Error(`Missing required key property: ${propKey}`)
  }, {})

  Object.defineProperty(key, 'string', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: Object.values(key).join('.'),
  })

  return key
}

AggregateWithKey.create = async function(props = {}, constructorParams) {
  const key = this.getKeyFromProps(props)

  const instance = new this({
    aggregateId: `${this.name}:${key.string}`,
    ...constructorParams,
  })

  if (!(instance.create || this.commands || this.commands.create)) {
    throw new Error('The aggregate subclass must implement create()')
  }

  await instance.hydrate()
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
    keyString = this.getKeyFromProps(rest).string
  }

  const aggregateId = `${this.name}:${keyString}`
  const instance = await this._load({
    ...constructorParams,
    ...versionParams,
    aggregateId,
  })

  if (instance.version > 0 && Object.keys(instance.state).length) {
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

AggregateWithKey.getState = async function(...args) {
  const instance = await this.load(...args)

  return instance && instance.state
}

export default AggregateWithKey
