import Aggregate from './Aggregate'

class MultiInstanceAggregate extends Aggregate {
  static idFromProps = () => {
    throw new Error('Aggregate must implement idFromProps()')
  }
}

MultiInstanceAggregate.create = async function(props, constructorParams) {
  const instance = new this({
    aggregateId: `${this.name}:${this.idFromProps(props)}`,
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
  if (!props) {
    throw new Error('You must provide props')
  }

  const aggregate = new this({
    aggregateId: `${this.name}:${typeof props === 'string'
      ? props
      : this.idFromProps(props)}`,
    ...constructorParams,
  })

  await aggregate.hydrate({version, time})

  return aggregate.version > 0 ? aggregate : null
}

export default MultiInstanceAggregate
