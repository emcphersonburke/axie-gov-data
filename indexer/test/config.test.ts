import { describe, expect, it } from 'vitest'

import {
  isSkyMavisHost,
  loadConfig,
  parseRpcUrls,
  redactConfig,
} from '../src/config.js'

describe('config', () => {
  it('requires RONIN_API_KEY and defaults everything else', () => {
    expect(() => loadConfig({}, { ensureDirs: false })).toThrow(/RONIN_API_KEY/)
    const c = loadConfig({ RONIN_API_KEY: 'k' }, { ensureDirs: false })
    expect(c.CONFIRMATIONS).toBe(30)
    expect(c.RANGE_START).toBe(2000)
    expect(c.RANGE_MAX).toBe(100_000)
    expect(c.LOG_FETCH_STRATEGY).toBe('receipts')
    expect(c.endpoints).toHaveLength(1)
    expect(c.endpoints[0]?.apiKey).toBe('k')
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('only attaches the API key to Sky Mavis hosts', () => {
    expect(isSkyMavisHost('https://api-gateway.skymavis.com/rpc')).toBe(true)
    expect(isSkyMavisHost('https://api.roninchain.com/rpc')).toBe(false)
    const c = loadConfig(
      { RONIN_API_KEY: 'k', RONIN_RPC_URL: 'https://api.roninchain.com/rpc' },
      { ensureDirs: false },
    )
    expect(c.endpoints[0]?.apiKey).toBeUndefined()
  })

  it('parses RPC_URLS pool entries with optional rps and batch size', () => {
    const eps = parseRpcUrls(
      'https://a.example/rpc|5|3, https://b.example/rpc',
      { rps: 10, maxRps: 50, batchSize: 20 },
    )
    expect(eps).toEqual([
      { url: 'https://a.example/rpc', rps: 5, maxRps: 50, batchSize: 3 },
      { url: 'https://b.example/rpc', rps: 10, maxRps: 50, batchSize: 20 },
    ])
    expect(() =>
      parseRpcUrls('nope', { rps: 10, maxRps: 50, batchSize: 20 }),
    ).toThrow(/invalid entry/)
    const c = loadConfig(
      { RONIN_API_KEY: 'k', RPC_URLS: 'https://b.example/rpc|4' },
      { ensureDirs: false },
    )
    expect(c.endpoints).toHaveLength(2)
    expect(c.endpoints[1]?.apiKey).toBeUndefined()
  })

  it('redacts secrets', () => {
    const c = loadConfig(
      { RONIN_API_KEY: 'super-secret' },
      { ensureDirs: false },
    )
    const s = JSON.stringify(redactConfig(c))
    expect(s).not.toContain('super-secret')
    expect(s).toContain('<redacted>')
  })

  it('rejects inconsistent ranges', () => {
    expect(() =>
      loadConfig(
        { RONIN_API_KEY: 'k', RANGE_START: '10', RANGE_MIN: '50' },
        { ensureDirs: false },
      ),
    ).toThrow(/RANGE_MIN/)
    expect(() =>
      loadConfig(
        { RONIN_API_KEY: 'k', RPC_START_RPS: '100', RPC_MAX_RPS: '50' },
        { ensureDirs: false },
      ),
    ).toThrow(/RPC_START_RPS/)
  })
})
