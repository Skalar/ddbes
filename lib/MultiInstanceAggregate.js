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

  static async create(props = {}, constructorParams) {
    const instance = new this({
      id: this.idFromProps(props),
      ...constructorParams,
    })

    if (!instance.create) {
      throw new Error('The aggregate subclass must implement create()')
    }

    await instance.create({
      id: this.idFromProps(props),
      ...props
    })

    return instance
  }

  static async load(props, constructorParams) {
    if (!props) {
      throw new Error('You must provide an id string or props')
    }

    const id = (typeof props === 'string') ? props : this.idFromProps(props)
    const aggregate = new this({id, ...constructorParams})
    await aggregate.hydrate()

    return aggregate.version > 0 ? aggregate : null
  }

  get aggregateId() {
    return `${this.constructor.name}:${this.id}`
  }
}

export default MultiInstanceAggregate
