function dateString(obj) {
  if (!obj || typeof obj === 'string') return obj
  return obj.toISOString()
}

export default dateString
