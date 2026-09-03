import { describe, expect, it } from 'vitest'

import {
  collectSecrets,
  isSkyMavisHost,
  loadConfig,
  parseRpcUrls,
  redactConfig,
  redactRpcUrls,
} from '../src/config.js'
import { scrubSecrets } from '../src/logger.js'

const defaults = { rps: 10, maxRps: 50, batchSize: 20 }

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
    expect(c.endpoints[0]?.priority).toBe(0)
    expect(c.endpoints[0]?.methods).toBeUndefined()
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
      defaults,
    )
    expect(eps).toEqual([
      {
        url: 'https://a.example/rpc',
        rps: 5,
        maxRps: 50,
        batchSize: 3,
        priority: 10,
      },
      {
        url: 'https://b.example/rpc',
        rps: 10,
        maxRps: 50,
        batchSize: 20,
        priority: 10,
      },
    ])
    expect(() => parseRpcUrls('nope', defaults)).toThrow(/invalid entry/)
    const c = loadConfig(
      { RONIN_API_KEY: 'k', RPC_URLS: 'https://b.example/rpc|4' },
      { ensureDirs: false },
    )
    expect(c.endpoints).toHaveLength(2)
    expect(c.endpoints[1]?.apiKey).toBeUndefined()
  })

  it('parses per-endpoint options: methods, priority, basic, key', () => {
    const eps = parseRpcUrls(
      'https://logs.example/v2/abc|20|20|methods=eth_getLogs,eth_getBlockByNumber;priority=0, ' +
        'https://b.example/rpc|||Basic=user:pw;key=k123;priority=3',
      defaults,
    )
    expect(eps).toEqual([
      {
        url: 'https://logs.example/v2/abc',
        rps: 20,
        maxRps: 50,
        batchSize: 20,
        priority: 0,
        methods: ['eth_getLogs', 'eth_getBlockByNumber'],
      },
      {
        url: 'https://b.example/rpc',
        rps: 10,
        maxRps: 50,
        batchSize: 20,
        priority: 3,
        basicAuth: 'user:pw',
        apiKey: 'k123',
      },
    ])
  })

  it('applies RONIN_RPC_METHODS and RONIN_RPC_PRIORITY to the primary', () => {
    const c = loadConfig(
      {
        RONIN_API_KEY: 'k',
        RONIN_RPC_METHODS: 'eth_getTransactionReceipt, eth_getBlockByNumber',
        RONIN_RPC_PRIORITY: '5',
        RPC_URLS: 'https://b.example/rpc',
      },
      { ensureDirs: false },
    )
    expect(c.endpoints[0]?.methods).toEqual([
      'eth_getTransactionReceipt',
      'eth_getBlockByNumber',
    ])
    expect(c.endpoints[0]?.priority).toBe(5)
    expect(c.endpoints[1]?.priority).toBe(10)
    expect(c.endpoints[1]?.methods).toBeUndefined()
    expect(() =>
      loadConfig(
        { RONIN_API_KEY: 'k', RONIN_RPC_METHODS: 'eth-getLogs' },
        { ensureDirs: false },
      ),
    ).toThrow(/RONIN_RPC_METHODS: "eth-getLogs" is not a JSON-RPC method name/)
  })

  it('rejects malformed endpoint options without echoing credentials', () => {
    const bad = (urls: string) => () => parseRpcUrls(urls, defaults)
    expect(bad('https://a.example/rpc|||colour=red')).toThrow(
      /RPC_URLS entry a.example: unknown option "colour"/,
    )
    expect(bad('https://a.example/rpc|||priority=high')).toThrow(
      /priority must be an integer/,
    )
    expect(bad('https://a.example/rpc|||priority=')).toThrow(
      /priority must be an integer/,
    )
    expect(bad('https://a.example/rpc|||basic=nocolon')).toThrow(
      /basic must be "user:password"/,
    )
    expect(bad('https://a.example/rpc|||methods=')).toThrow(
      /methods list is empty/,
    )
    expect(bad('https://a.example/rpc|||methods=eth-getLogs')).toThrow(
      /not a JSON-RPC method name/,
    )
    expect(bad('https://a.example/rpc|||key=')).toThrow(/key must not be empty/)
    expect(bad('https://a.example/rpc|||basic')).toThrow(/key=value/)
    expect(bad('https://a.example/rpc|abc')).toThrow(/invalid rps/)
    expect(bad('https://a.example/rpc|5|0')).toThrow(/invalid batch size/)

    let message = ''
    try {
      parseRpcUrls(
        'ftp://a.example|||basic=user:supersecretpw;key=SECRETKEY123456',
        defaults,
      )
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/invalid entry/)
    expect(message).toContain('basic=<redacted>')
    expect(message).not.toContain('supersecretpw')
    expect(message).not.toContain('SECRETKEY123456')
  })

  it('redacts RPC_URLS credentials but keeps the hosts readable', () => {
    expect(
      redactRpcUrls(
        'https://a.example/rpc|||basic=u:p;key=K, https://b.example/rpc|||key=K2',
      ),
    ).toBe(
      'https://a.example/rpc|||basic=<redacted>;key=<redacted>, https://b.example/rpc|||key=<redacted>',
    )
  })

  it('redacts secrets, including per-endpoint credentials', () => {
    const c = loadConfig(
      {
        RONIN_API_KEY: 'super-secret',
        RONIN_RPC_BASIC_AUTH: 'chainuser:chainpassword',
        RPC_URLS:
          'https://ronin-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUv|20|20|methods=eth_getLogs;priority=0, ' +
          'https://b.example/rpc|||basic=buser:bpassword123;key=extrakey12345',
      },
      { ensureDirs: false },
    )
    const redacted = redactConfig(c)
    const s = JSON.stringify(redacted)
    for (const secret of [
      'super-secret',
      'chainpassword',
      'AbCdEfGhIjKlMnOpQrStUv',
      'bpassword123',
      'extrakey12345',
    ])
      expect(s).not.toContain(secret)
    expect(s).toContain('<redacted>')
    expect(redacted.RONIN_RPC_BASIC_AUTH).toBe('<redacted>')
    expect(redacted.endpoints).toEqual([
      expect.objectContaining({
        url: 'https://api-gateway.skymavis.com/rpc',
        priority: 0,
        hasKey: true,
        hasBasicAuth: true,
      }),
      expect.objectContaining({
        url: 'https://ronin-mainnet.g.alchemy.com/v2/***',
        priority: 0,
        methods: ['eth_getLogs'],
        hasKey: false,
        hasBasicAuth: false,
      }),
      expect.objectContaining({
        url: 'https://b.example/rpc',
        priority: 10,
        hasKey: true,
        hasBasicAuth: true,
      }),
    ])
  })

  it('collects every literal credential for the log scrubber', () => {
    const c = loadConfig(
      {
        RONIN_API_KEY: 'super-secret',
        RONIN_RPC_BASIC_AUTH: 'chainuser:chainpassword',
        RPC_URLS:
          'https://b.example/rpc|||basic=buser:bpassword123;key=extrakey12345',
      },
      { ensureDirs: false },
    )
    const secrets = collectSecrets(c)
    const b64 = (s: string) => Buffer.from(s).toString('base64')
    expect(secrets).toEqual(
      expect.arrayContaining([
        'super-secret',
        'chainuser:chainpassword',
        'chainpassword',
        b64('chainuser:chainpassword'),
        'buser:bpassword123',
        'bpassword123',
        b64('buser:bpassword123'),
        'extrakey12345',
      ]),
    )
    expect(
      scrubSecrets(
        `Authorization: Basic ${b64('buser:bpassword123')} key=extrakey12345`,
        secrets,
      ),
    ).toBe('Authorization: Basic *** key=***')
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
