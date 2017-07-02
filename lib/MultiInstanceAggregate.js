import Aggregate from './Aggregate'
import uuid from 'uuid/v4'

class MultiInstanceAggregate extends Aggregate {}

MultiInstanceAggregate.create = async function(props, constructorParams) {
  const id = this.idFromProps ? this.idFromProps(props) : props.id || uuid()

  const instance = new this({
    aggregateId: `${this.name}:${id}`,
    ...constructorParams,
  })

  if (!(instance.create || this.commands || this.commands.create)) {
    throw new Error('The aggregate subclass must implement create()')
  }

  await instance.create(this.idFromProps ? props : {...props, id})

  return instance
}

MultiInstanceAggregate.load = async function(
  props,
  {version, time, ...constructorParams} = {}
) {
  if (!props) {
    throw new Error('You must provide props')
  }

  let id

  if (typeof props === 'string') {
    id = props
  } else {
    id = this.idFromProps ? this.idFromProps(props) : props.id
  }

  const aggregate = new this({
    aggregateId: `${this.name}:${id}`,
    ...constructorParams,
  })

  await aggregate.hydrate({version, time})

  return aggregate.version > 0 ? aggregate : null
}

export default MultiInstanceAggregate
