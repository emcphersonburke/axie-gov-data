import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import fixture from '../../fixtures/dashboard.json'
import { snapshotReducer } from './snapshotContext'
import { SnapshotProvider } from './SnapshotProvider'
import { useSnapshot } from './useSnapshot'

function Probe() {
  const state = useSnapshot()
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="stale">{String(state.isStale)}</span>
      {state.status === 'ready' && (
        <span data-testid="generated">{state.snapshot.generatedAt}</span>
      )}
      {state.status === 'error' && (
        <button onClick={state.retry}>{state.message}</button>
      )}
    </div>
  )
}

describe('<SnapshotProvider>', () => {
  it('goes loading → ready and exposes the snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })),
    )
    render(
      <SnapshotProvider url="/test.json">
        <Probe />
      </SnapshotProvider>,
    )
    expect(screen.getByTestId('status').textContent).toBe('loading')
    await screen.findByText('ready')
    expect(screen.getByTestId('generated').textContent).toBe(
      fixture.generatedAt,
    )
    expect(screen.getByTestId('stale').textContent).toBe('false')
  })

  it('surfaces a friendly error and retries on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <SnapshotProvider url="/test.json">
        <Probe />
      </SnapshotProvider>,
    )
    const button = await screen.findByRole('button')
    expect(button.textContent).toMatch(/unexpected shape/)
    await act(async () => {
      button.click()
    })
    await screen.findByText('ready')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('snapshotReducer', () => {
  const snapshot = fixture as never

  it('keeps the same state object when generatedAt is unchanged', () => {
    const ready = snapshotReducer(
      { status: 'loading' },
      { type: 'success', snapshot },
    )
    expect(snapshotReducer(ready, { type: 'success', snapshot })).toBe(ready)
  })

  it('keeps the last-good snapshot on a refetch failure and clears it on success', () => {
    const ready = snapshotReducer(
      { status: 'loading' },
      { type: 'success', snapshot },
    )
    const failed = snapshotReducer(ready, { type: 'failure', message: 'boom' })
    expect(failed.status).toBe('ready')
    if (failed.status === 'ready') {
      expect(failed.snapshot).toBe(fixture)
      expect(failed.refetchError).toBe('boom')
    }
    const recovered = snapshotReducer(failed, { type: 'success', snapshot })
    expect(recovered.status === 'ready' && recovered.refetchError).toBeNull()
  })

  it('turns an initial failure into the error state, and retry back into loading', () => {
    const error = snapshotReducer(
      { status: 'loading' },
      { type: 'failure', message: 'nope' },
    )
    expect(error).toEqual({ status: 'error', message: 'nope' })
    expect(snapshotReducer(error, { type: 'retry' })).toEqual({
      status: 'loading',
    })
  })
})
