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

AggregateWithKey.getKeyFromProps = function(props) {
  if (typeof props === 'string') return props

  const key = this.keyProperties.reduce((key, keyProp) => {
    const propKey = typeof keyProp === 'string' ? keyProp : keyProp.name

    if (typeof props[propKey] !== 'undefined') {
      return {...key, [propKey]: props[propKey]}
    }

    if (typeof keyProp.defaultValue === 'function') {
      return {...key, [propKey]: keyProp.defaultValue()}
    } else if (typeof keyProp.defaultValue !== undefined) {
      return {...key, [propKey]: keyProp.defaultValue}
    }

    throw new Error(`Empty id property: ${propKey}`)
  }, {})

  Object.defineProperty(key, 'string', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: Object.values(key).join('.'),
  })

  return key
}

AggregateWithKey.create = async function(props, constructorParams) {
  const key = this.getKeyFromProps(props)

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
  const keyString =
    typeof keyProps === 'string'
      ? keyProps
      : this.getKeyFromProps(keyProps).string

  const aggregateId = `${this.name}:${keyString}`
  const instance = await this._load({...constructorParams, aggregateId})

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

export default AggregateWithKey
