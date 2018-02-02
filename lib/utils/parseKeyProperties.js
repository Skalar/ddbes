function parseKeyProperties({schema, props, separator = '.'}) {
  if (!schema) return {keyString: '@', keyProps: {}}

  const keyProps = schema.reduce((key, keyProp) => {
    const propKey = typeof keyProp === 'string' ? keyProp : keyProp.name

    if (typeof keyProp.value === 'function') {
      return {...key, [propKey]: keyProp.value(props)}
    }

    if (props[propKey] != null || keyProp.optional) {
      return {...key, [propKey]: props[propKey]}
    }

    throw new Error(`Missing required key property: ${propKey}`)
  }, {})

  return {
    keyString: Object.values(keyProps).join(separator),
    keyProps,
  }
}

export default parseKeyProperties
