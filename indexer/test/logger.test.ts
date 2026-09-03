import { describe, expect, it } from 'vitest'

import { scrubDeep, scrubSecrets } from '../src/logger.js'

describe('log scrubbing', () => {
  it('masks literal secret values anywhere', () => {
    expect(scrubSecrets('key=abcdefgh12345 in text', ['abcdefgh12345'])).toBe(
      'key=*** in text',
    )
    expect(scrubSecrets('short', ['abc'])).toBe('short') // too short to be a real secret; left alone
  })
  it('masks URL-embedded keys but keeps tx hashes', () => {
    const tx = '0x' + 'ab'.repeat(32)
    expect(
      scrubSecrets(
        'https://lb.drpc.org/ogrpc?network=ronin&dkey=AbCdEf0123456789',
      ),
    ).toBe('https://lb.drpc.org/ogrpc?network=ronin&dkey=***')
    expect(
      scrubSecrets(
        'https://ronin-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUv',
      ),
    ).toBe('https://ronin-mainnet.g.alchemy.com/v2/***')
    expect(
      scrubSecrets(
        'https://ronin-mainnet.core.chainstack.com/0123456789abcdef0123456789abcdef',
      ),
    ).toBe('https://ronin-mainnet.core.chainstack.com/***')
    expect(
      scrubSecrets(`receipt for ${tx} at https://api.roninchain.com/rpc`),
    ).toBe(`receipt for ${tx} at https://api.roninchain.com/rpc`)
  })
  it('scrubs nested objects and Error messages', () => {
    const err = new Error(
      'HTTP request failed.\nURL: https://x.example/v2/AbCdEfGhIjKlMnOpQrStUv',
    )
    const out = scrubDeep(
      { err, url: 'https://a.b/?apikey=SECRETSECRET1' },
      [],
    ) as {
      err: { message: string; type: string }
      url: string
    }
    expect(out.err.type).toBe('Error')
    expect(out.err.message).toContain('/v2/***')
    expect(out.url).toBe('https://a.b/?apikey=***')
  })
})
