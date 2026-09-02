import type { DashboardSnapshot } from '@axie-gov/shared'
import { STALE_LAG_BLOCKS } from '@axie-gov/shared'
import { createContext } from 'react'

/** Poll interval while the tab is visible. */
export const REFRESH_INTERVAL_MS = 60_000
/** On returning to the tab, refetch only if the last attempt is older than this. */
export const VISIBLE_REFRESH_MIN_AGE_MS = 30_000

export type SnapshotState =
  | { status: 'loading' }
  | {
      status: 'ready'
      snapshot: DashboardSnapshot
      /** message of the most recent failed refetch; the last-good snapshot is kept */
      refetchError: string | null
    }
  | { status: 'error'; message: string }

export type SnapshotAction =
  | { type: 'success'; snapshot: DashboardSnapshot }
  | { type: 'failure'; message: string }
  | { type: 'retry' }

export function snapshotReducer(
  state: SnapshotState,
  action: SnapshotAction,
): SnapshotState {
  switch (action.type) {
    case 'success':
      if (
        state.status === 'ready' &&
        state.snapshot.generatedAt === action.snapshot.generatedAt
      ) {
        // Nothing new: avoid a re-render unless we are recovering from a failed refetch.
        return state.refetchError === null
          ? state
          : { ...state, refetchError: null }
      }
      return { status: 'ready', snapshot: action.snapshot, refetchError: null }
    case 'failure':
      if (state.status === 'ready')
        return state.refetchError === action.message
          ? state
          : { ...state, refetchError: action.message }
      return { status: 'error', message: action.message }
    case 'retry':
      return state.status === 'error' ? { status: 'loading' } : state
  }
}

/** True when the numbers on screen may be behind the chain. */
export function computeIsStale(
  snapshot: DashboardSnapshot,
  refetchError: string | null,
): boolean {
  return (
    snapshot.indexer.status === 'backfilling' ||
    snapshot.indexer.lagBlocks > STALE_LAG_BLOCKS ||
    refetchError !== null
  )
}

export type SnapshotContextValue = SnapshotState & {
  /** Re-fetch now (used by the error panel's Retry button). */
  retry: () => void
  /** Only meaningful when ready; false otherwise. */
  isStale: boolean
}

export const SnapshotContext = createContext<SnapshotContextValue | null>(null)
