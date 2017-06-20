import uuid from 'uuid/v4'
import Aggregate from './Aggregate'
import config from './config'

class MultiInstanceAggregate extends Aggregate {
  static idFromProps = ({id = uuid()}) => id

  constructor(opts = {}) {
    const {id = uuid()} = opts

    super(opts)

    this.id = id
    this.logger = config.getLogger(this.aggregateId)
  }

  get aggregateId() {
    return `${this.constructor.name}:${this.id}`
  }
}

MultiInstanceAggregate.create = async function (props = {}, constructorParams) {
  const instance = new this({
    id: this.idFromProps(props),
    ...constructorParams,
  })

  if (!(instance.create || this.commands || this.commands.create)) {
    throw new Error('The aggregate subclass must implement create()')
  }

  await instance.create({
    id: this.idFromProps(props),
    ...props
  })

  return instance
}

MultiInstanceAggregate.load = async function(props, {version, time, ...constructorParams} = {}) {
  if (!props) {
    throw new Error('You must provide an id string or props')
  }

  const id = (typeof props === 'string') ? props : this.idFromProps(props)
  const aggregate = new this({id, ...constructorParams})
  await aggregate.hydrate({version, time})

  return aggregate.version > 0 ? aggregate : null
}


export default MultiInstanceAggregate
