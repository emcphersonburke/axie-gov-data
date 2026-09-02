import {
  HttpRequestError,
  InvalidParamsRpcError,
  LimitExceededRpcError,
  RpcRequestError,
  TimeoutError,
} from 'viem'
import { describe, expect, it } from 'vitest'

import { classifyError, withRetry } from '../src/rpc/retry.js'
import { Throttle } from '../src/rpc/throttle.js'

const url = 'https://rpc.example/'
const body = { method: 'eth_getLogs' }

describe('classifyError', () => {
  it('maps HTTP 429 to rateLimited with Retry-After', () => {
    const err = new HttpRequestError({
      url,
      body,
      status: 429,
      headers: new Headers({ 'retry-after': '3' }),
    })
    const info = classifyError(err)
    expect(info.rateLimited).toBe(true)
    expect(info.retryAfterMs).toBe(3000)
    expect(info.shrinkRange).toBe(false)
  })

  it('maps 5xx and network failures to transient', () => {
    expect(
      classifyError(new HttpRequestError({ url, body, status: 503 })).transient,
    ).toBe(true)
    expect(
      classifyError(
        new HttpRequestError({ url, body, cause: new Error('fetch failed') }),
      ).transient,
    ).toBe(true)
    expect(classifyError(new TypeError('fetch failed')).transient).toBe(true)
  })

  it('treats timeouts as transient AND a range signal', () => {
    const info = classifyError(new TimeoutError({ url, body }))
    expect(info.transient).toBe(true)
    expect(info.shrinkRange).toBe(true)
  })

  it('parses the public Ronin RPC range cap out of -32602', () => {
    const rpcErr = new RpcRequestError({
      url,
      body,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: 'requested block range 2001 exceeds the limit of 200; narrow your fromBlock/toBlock',
      },
    })
    const info = classifyError(new InvalidParamsRpcError(rpcErr))
    expect(info.shrinkRange).toBe(true)
    expect(info.rangeLimit).toBe(200)
    expect(info.rateLimited).toBe(false)
  })

  it('treats -32005 as a range signal and rate-limit wording as 429', () => {
    const limit = new LimitExceededRpcError(
      new RpcRequestError({
        url,
        body,
        error: {
          code: -32005,
          message: 'query returned more than 10000 results',
        },
      }),
    )
    expect(classifyError(limit).shrinkRange).toBe(true)
    const rate = new LimitExceededRpcError(
      new RpcRequestError({
        url,
        body,
        error: { code: -32005, message: 'rate limit exceeded' },
      }),
    )
    expect(classifyError(rate).rateLimited).toBe(true)
  })

  it('parses drpc-style "ranges over N blocks" caps', () => {
    const info = classifyError(
      new Error('ranges over 10000 blocks are not supported on free plan'),
    )
    expect(info.shrinkRange).toBe(true)
    expect(info.rangeLimit).toBe(10_000)
  })

  it('does not retry HTTP 400/401/403', () => {
    for (const status of [400, 401, 403, 404]) {
      const info = classifyError(new HttpRequestError({ url, body, status }))
      expect(info.transient).toBe(false)
      expect(info.rateLimited).toBe(false)
      expect(info.shrinkRange).toBe(false)
    }
  })
})

describe('withRetry', () => {
  const noSleep = async () => {}
  const throttle = () =>
    new Throttle({
      startRps: 1000,
      maxRps: 1000,
      concurrency: 10,
      batchSize: 1,
    })

  it('retries transient failures with backoff and returns the eventual result', async () => {
    let calls = 0
    const t = throttle()
    const r = await withRetry(
      async () => {
        calls += 1
        if (calls < 3) throw new HttpRequestError({ url, body, status: 502 })
        return 'ok'
      },
      { throttle: t, label: 't', sleep: noSleep, random: () => 0.5 },
    )
    expect(r).toBe('ok')
    expect(calls).toBe(3)
    t.dispose()
  })

  it('gives up after maxAttempts transient failures', async () => {
    let calls = 0
    const t = throttle()
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw new HttpRequestError({ url, body, status: 500 })
        },
        { throttle: t, label: 't', sleep: noSleep, maxAttempts: 3 },
      ),
    ).rejects.toBeInstanceOf(HttpRequestError)
    expect(calls).toBe(3)
    t.dispose()
  })

  it('propagates range errors immediately when asked', async () => {
    let calls = 0
    const t = throttle()
    const err = new InvalidParamsRpcError(
      new RpcRequestError({
        url,
        body,
        error: { code: -32602, message: 'limit of 200' },
      }),
    )
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw err
        },
        {
          throttle: t,
          label: 't',
          sleep: noSleep,
          propagate: (i) => i.shrinkRange,
        },
      ),
    ).rejects.toBe(err)
    expect(calls).toBe(1)
    t.dispose()
  })

  it('applies the throttle pause on 429 and releases the semaphore while waiting', async () => {
    const t = new Throttle({
      startRps: 1000,
      maxRps: 1000,
      concurrency: 1,
      batchSize: 1,
      random: () => 0.5,
    })
    let calls = 0
    const p = withRetry(
      async () => {
        calls += 1
        if (calls === 1)
          throw new HttpRequestError({
            url,
            body,
            status: 429,
            headers: new Headers({ 'retry-after': '0' }),
          })
        return calls
      },
      { throttle: t, label: 't', sleep: noSleep },
    )
    await expect(p).resolves.toBe(2)
    expect(t.rps).toBeCloseTo(700)
    expect(t.snapshot().inFlight).toBe(0)
    t.dispose()
  })
})
