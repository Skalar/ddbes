function resolveConfig(objs, keys) {
  return objs.reduce((config, obj) => ({
    ...config,
    ...keys.reduce(
      (res, key) => (obj.hasOwnProperty(key) ? {...res, [key]: obj[key]} : res),
      {}
    ),
  }))
}

module.exports = resolveConfig
