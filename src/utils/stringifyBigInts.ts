export function stringifyBigInts(obj: any): any {
  if (typeof obj === 'bigint') {
    return obj.toString()
  } else if (Array.isArray(obj)) {
    return obj.map(stringifyBigInts)
  } else if (obj !== null && typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      result[key] = stringifyBigInts(obj[key])
    }
    return result
  }
  return obj
}
