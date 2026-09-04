import { describe, expect, it } from 'vitest'

import { classifyError } from '../src/rpc/retry.js'

describe('oversized responses', () => {
  it('are neither range errors nor endpoint failures', () => {
    const info = classifyError(
      new Error(
        'HTTP response body exceeded the size limit. Max: 10485760 bytes Received: 10502144 bytes',
      ),
    )
    expect(info.oversized).toBe(true)
    expect(info.shrinkRange).toBe(false)
    expect(info.rateLimited).toBe(false)
    expect(info.transient).toBe(false)
  })
})
