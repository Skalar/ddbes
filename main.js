const semver = require('semver')
const version = process.versions.node

if (semver.satisfies(version, '>= 9.0.0')) {
  if (typeof Symbol.asyncIterator === 'symbol') {
    module.exports = require('./lib')
  } else {
    require('@babel/polyfill')
    module.exports = require('./lib-9.0.0')
  }
} else if (semver.satisfies(version, '>= 6.5.0')) {
  require('@babel/polyfill')
  module.exports = require('./lib-6.13.0')
} else {
  throw new Error('NodeJS 6.5.0 or newer is required')
}
