import Aggregate from './Aggregate'
import uuid from 'uuid/v4'

class MultiInstanceAggregate extends Aggregate {
  static idProps = [
    {
      name: 'id',
      defaultValue: () => uuid(),
    },
  ]
}

MultiInstanceAggregate.propsToIdString = function(props) {
  if (!props) {
    throw new Error('No props was provided')
  }

  return this.idProps
    .map(idProp => {
      const propKey = typeof idProp === 'string' ? idProp : idProp.name

      if (typeof props[propKey] !== 'undefined') {
        return props[propKey]
      }

      if (typeof idProp.defaultValue === 'function') {
        return idProp.defaultValue()
      } else if (typeof idProp.defaultValue !== undefined) {
        return idProp.defaultValue
      }

      throw new Error(`Empty id property: ${propKey}`)
    })
    .join('.')
}

MultiInstanceAggregate.create = async function(props, constructorParams) {
  const instanceId = this.propsToIdString(props)

  const instance = new this({
    aggregateId: `${this.name}:${instanceId}`,
    ...constructorParams,
  })

  if (!(instance.create || this.commands || this.commands.create)) {
    throw new Error('The aggregate subclass must implement create()')
  }

  await instance.create(props)

  return instance
}

MultiInstanceAggregate.load = async function(
  props,
  {version, time, ...constructorParams} = {}
) {
  const instanceId =
    typeof props === 'string' ? props : this.propsToIdString(props)

  const instance = new this({
    aggregateId: `${this.name}:${instanceId}`,
    ...constructorParams,
  })

  await instance.hydrate({version, time})

  return instance.version > 0 ? instance : null
}

export default MultiInstanceAggregate
