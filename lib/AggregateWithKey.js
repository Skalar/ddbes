import Aggregate from './Aggregate'
import uuid from 'uuid/v4'
import {AggregateNotFoundError} from './errors'

class AggregateWithKey extends Aggregate {
  static keyPropSeparator = '.'

  static keyProperties = [
    {
      name: 'id',
      value: ({id}) => id || uuid(),
    },
  ]

  static getKeyFromProps(props) {
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

    if (
      Object.values(key).some(
        prop => typeof prop === 'string' && prop.includes(this.keyPropSeparator)
      )
    ) {
      throw new Error(
        `Key prop cannot contain the key property separator (${
          this.keyPropSeparator
        })`
      )
    }

    Object.defineProperty(key, 'string', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: Object.values(key).join(this.keyPropSeparator),
    })

    return key
  }

  static async create(props = {}, constructorParams) {
    const key = this.getKeyFromProps(props)

    const instance = new this({
      aggregateId: `${this.name}:${key.string}`,
      ...constructorParams,
    })

    await instance.hydrate()
    await instance.create({...props, ...key})

    return instance
  }

  static async load(keyProps, {fail = false, ...constructorParams} = {}) {
    let keyString, versionParams

    if (typeof keyProps === 'string') {
      keyString = keyProps
    } else {
      const {_time: time, _version: version, ...rest} = keyProps
      versionParams = {time, version}
      keyString = this.getKeyFromProps(rest).string
    }

    const aggregateId = `${this.name}:${keyString}`
    const instance = await super.load({
      ...constructorParams,
      ...versionParams,
      aggregateId,
    })

    if (instance.version > 0 && Object.keys(instance.state).length) {
      return instance
    }

    if (fail) {
      throw new AggregateNotFoundError(
        `${this.name} with key '${keyString}' does exist`
      )
    }

    return null
  }

  static async loadOrCreate(...args) {
    return (await this.load(...args)) || (await this.create(...args))
  }

  static async getState(...args) {
    const instance = await this.load(...args)

    return instance && instance.state
  }

  create() {
    throw new Error('The aggregate class must implement create()')
  }
}

export default AggregateWithKey
