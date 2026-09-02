import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import { DATA_URL, describeError, fetchSnapshot } from './fetchSnapshot'
import type { SnapshotContextValue } from './snapshotContext'
import {
  computeIsStale,
  REFRESH_INTERVAL_MS,
  SnapshotContext,
  snapshotReducer,
  VISIBLE_REFRESH_MIN_AGE_MS,
} from './snapshotContext'

interface SnapshotProviderProps {
  children: ReactNode
  /** Override the snapshot URL (tests); defaults to VITE_DATA_URL or /data/dashboard.json. */
  url?: string
}

export function SnapshotProvider({
  children,
  url = DATA_URL,
}: SnapshotProviderProps) {
  const [state, dispatch] = useReducer(snapshotReducer, { status: 'loading' })
  const inFlight = useRef<AbortController | null>(null)
  const lastAttemptAt = useRef(0)

  const load = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    try {
      const snapshot = await fetchSnapshot(url, controller.signal)
      if (controller.signal.aborted) return
      dispatch({ type: 'success', snapshot })
    } catch (error) {
      if (controller.signal.aborted) return
      dispatch({ type: 'failure', message: describeError(error) })
    } finally {
      if (!controller.signal.aborted) lastAttemptAt.current = Date.now()
      if (inFlight.current === controller) inFlight.current = null
    }
  }, [url])

  useEffect(() => {
    void load()

    const onInterval = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastAttemptAt.current > VISIBLE_REFRESH_MIN_AGE_MS
      )
        void load()
    }
    const onOnline = () => void load()

    const interval = window.setInterval(onInterval, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [load])

  const retry = useCallback(() => {
    dispatch({ type: 'retry' })
    void load()
  }, [load])

  const value = useMemo<SnapshotContextValue>(
    () => ({
      ...state,
      retry,
      isStale:
        state.status === 'ready'
          ? computeIsStale(state.snapshot, state.refetchError)
          : false,
    }),
    [state, retry],
  )

  return (
    <SnapshotContext.Provider value={value}>
      {children}
    </SnapshotContext.Provider>
  )
}
