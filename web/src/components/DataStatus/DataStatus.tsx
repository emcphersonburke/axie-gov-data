import type { DashboardSnapshot } from '@axie-gov/shared'
import { STALE_LAG_BLOCKS } from '@axie-gov/shared'

import {
  formatBlock,
  formatCompact,
  formatDateTime,
  formatDuration,
} from '~/lib/format'

import styles from './DataStatus.module.scss'

interface DataStatusProps {
  snapshot: DashboardSnapshot
  isStale: boolean
  refetchError: string | null
}

function staleMessage(
  snapshot: DashboardSnapshot,
  refetchError: string | null,
): string {
  const { indexer } = snapshot
  const behind = `≈${formatCompact(indexer.lagBlocks)} blocks (${formatDuration(
    indexer.lagSeconds,
  )}) behind the chain`
  if (indexer.status === 'backfilling')
    return `The indexer is catching up with the chain — currently ${behind}. Totals and charts may be behind the latest on-chain activity.`
  if (indexer.lagBlocks > STALE_LAG_BLOCKS)
    return `The indexer is running ${behind}. Figures may be behind the latest on-chain activity.`
  if (refetchError !== null)
    return 'Live data could not be refreshed — the figures shown may be behind the latest on-chain activity.'
  return 'Data may be behind the latest on-chain activity.'
}

export default function DataStatus({
  snapshot,
  isStale,
  refetchError,
}: DataStatusProps) {
  const { indexer, rates, generatedAt } = snapshot
  return (
    <div className={styles.status}>
      <p className={styles.meta}>
        Data as of{' '}
        <time dateTime={indexer.lastIndexedAt}>
          {formatDateTime(indexer.lastIndexedAt)}
        </time>{' '}
        (block {formatBlock(indexer.lastIndexedBlock)})
        <span className={styles.separator} aria-hidden="true">
          {' · '}
        </span>
        Prices as of{' '}
        {rates.fetchedAt ? (
          <time dateTime={rates.fetchedAt}>
            {formatDateTime(rates.fetchedAt)}
          </time>
        ) : (
          'unavailable'
        )}
        {rates.stale && rates.fetchedAt ? ' (stale)' : null}
      </p>
      {isStale && (
        <p className={styles.disclaimer} role="status">
          {staleMessage(snapshot, refetchError)}
        </p>
      )}
      {refetchError !== null && (
        <p className={styles.paused} role="status">
          Live updates paused, showing data from{' '}
          <time dateTime={generatedAt}>{formatDateTime(generatedAt)}</time>.
        </p>
      )}
    </div>
  )
}
