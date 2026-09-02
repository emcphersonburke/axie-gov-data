import { useContext } from 'react'

import type { SnapshotContextValue } from './snapshotContext'
import { SnapshotContext } from './snapshotContext'

export function useSnapshot(): SnapshotContextValue {
  const value = useContext(SnapshotContext)
  if (value === null)
    throw new Error('useSnapshot must be used inside <SnapshotProvider>')
  return value
}
