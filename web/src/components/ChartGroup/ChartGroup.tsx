import type { DashboardSnapshot, RangeKey, RangeStats } from '@axie-gov/shared'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { DEFAULT_RANGE, RANGE_LABELS, RANGE_ORDER } from '~/lib/ranges'

import styles from './ChartGroup.module.scss'

/** The stats for the selected range plus which range it is. */
export type SelectedRange = RangeStats & { key: RangeKey }

interface ChartGroupProps {
  title: string
  subtitle?: string
  ranges: DashboardSnapshot['ranges']
  initialRange?: RangeKey
  children: (range: SelectedRange) => ReactNode
}

export default function ChartGroup({
  title,
  subtitle,
  ranges,
  initialRange = DEFAULT_RANGE,
  children,
}: ChartGroupProps) {
  const [selected, setSelected] = useState<RangeKey>(initialRange)
  const stats = ranges[selected]

  return (
    <section className={styles.chartGroup} aria-label={title}>
      <h2 className={styles.heading}>{title}</h2>
      {subtitle && <h3 className={styles.subheading}>{subtitle}</h3>}
      <div className={styles.controls} role="group" aria-label="Time range">
        {RANGE_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className={selected === key ? styles.active : undefined}
            aria-pressed={selected === key}
            onClick={() => setSelected(key)}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>
      <div className={styles.chartWrapper}>
        {stats ? (
          children({ ...stats, key: selected })
        ) : (
          <p className={styles.empty}>No data available for this range.</p>
        )}
      </div>
    </section>
  )
}
