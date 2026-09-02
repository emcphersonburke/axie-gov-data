import { describe, expect, it, vi } from 'vitest'

import fixture from '../../fixtures/dashboard.json'
import { fetchSnapshot, SnapshotFetchError } from './fetchSnapshot'

const jsonResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

describe('fetchSnapshot', () => {
  it('resolves a valid snapshot and requests it with cache: no-cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(JSON.stringify(fixture)))
    vi.stubGlobal('fetch', fetchMock)
    const snapshot = await fetchSnapshot('/data/dashboard.json')
    expect(snapshot.schemaVersion).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/data/dashboard.json',
      expect.objectContaining({ cache: 'no-cache' }),
    )
  })

  it('rejects JSON with the wrong shape with a friendly message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(JSON.stringify({ hello: 'world' }))),
    )
    const error = await fetchSnapshot('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SnapshotFetchError)
    expect((error as SnapshotFetchError).kind).toBe('schema')
    expect((error as Error).message).toMatch(/unexpected shape/)
    expect((error as Error).message).not.toMatch(/ZodError|invalid_type/)
  })

  it('rejects a snapshot missing a range', async () => {
    const { ranges, ...rest } = fixture
    const { all: _all, ...partial } = ranges
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(JSON.stringify({ ...rest, ranges: partial })),
      ),
    )
    const error = await fetchSnapshot('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SnapshotFetchError)
    expect((error as Error).message).toMatch(/missing the all range/)
  })

  it('rejects malformed JSON text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{ not json')),
    )
    const error = await fetchSnapshot('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SnapshotFetchError)
    expect((error as SnapshotFetchError).kind).toBe('parse')
    expect((error as Error).message).toMatch(/could not be read/)
  })

  it('rejects HTTP errors with the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('nope', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
      ),
    )
    const error = await fetchSnapshot('/x').catch((e: unknown) => e)
    expect((error as SnapshotFetchError).kind).toBe('http')
    expect((error as Error).message).toMatch(/503/)
  })

  it('wraps network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const error = await fetchSnapshot('/x').catch((e: unknown) => e)
    expect((error as SnapshotFetchError).kind).toBe('network')
    expect((error as Error).message).toMatch(/Could not reach/)
  })
})
