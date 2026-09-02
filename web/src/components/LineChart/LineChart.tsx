import type { PointTooltipProps } from '@nivo/line'
import { ResponsiveLine } from '@nivo/line'
import { useMemo } from 'react'

import type { SelectedRange } from '~/components/ChartGroup/ChartGroup'
import { formatBucketTime, formatDelta, formatUsd } from '~/lib/format'
import { lineColor, nivoTheme, tooltipBackground } from '~/lib/palette'
import type { Token } from '~/lib/series'
import { buildCumulativeSeries } from '~/lib/series'

import styles from './LineChart.module.scss'

interface LineChartProps {
  range: SelectedRange
  token: Token
}

export default function LineChart({ range, token }: LineChartProps) {
  const label = token.toUpperCase()
  const { points, delta } = useMemo(
    () => buildCumulativeSeries(range, token),
    [range, token],
  )
  const theme = useMemo(() => nivoTheme(), [])
  const color = lineColor(token)

  const Tooltip = ({ point }: PointTooltipProps) => (
    <div
      className={styles.tooltip}
      style={{ color: point.serieColor, background: tooltipBackground() }}
    >
      <div className={styles.tooltipTime}>
        {formatBucketTime(Number(point.data.x), range.bucket)}
      </div>
      <strong>
        {formatUsd(Number(point.data.y))} {label}
      </strong>
    </div>
  )

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>{label}</h3>
      <p className={styles.subheading}>
        {formatDelta(delta)} {label}
      </p>
      <div className={styles.chart}>
        {points.length === 0 ? (
          <p className={styles.empty}>No data available</p>
        ) : (
          <ResponsiveLine
            data={[
              {
                id: label,
                data: points.map((p) => ({ x: p.t, y: p.value })),
              },
            ]}
            margin={{ top: 12, right: 8, bottom: 48, left: 8 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            animate={false}
            curve="monotoneX"
            axisTop={null}
            axisRight={null}
            axisBottom={null}
            axisLeft={null}
            colors={[color]}
            enableCrosshair={false}
            theme={theme}
            enablePoints={false}
            enableArea
            areaOpacity={0.3}
            useMesh
            enableGridX={false}
            enableGridY={false}
            tooltip={Tooltip}
          />
        )}
      </div>
    </div>
  )
}
