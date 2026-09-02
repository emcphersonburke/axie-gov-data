import type { PieTooltipProps } from '@nivo/pie'
import { ResponsivePie } from '@nivo/pie'
import { useMemo } from 'react'

import type { SelectedRange } from '~/components/ChartGroup/ChartGroup'
import { useMediaQuery } from '~/hooks/useMediaQuery'
import { formatToken } from '~/lib/format'
import {
  nivoTheme,
  pieBaseColor,
  pieColor,
  tooltipBackground,
} from '~/lib/palette'
import type { PieDatum, PieMode } from '~/lib/pie'
import { buildPieData } from '~/lib/pie'
import type { Token } from '~/lib/series'

import styles from './PieChart.module.scss'

interface PieChartProps {
  range: SelectedRange
  mode: PieMode
  token: Token
}

const legendBase = {
  direction: 'column',
  translateY: 65,
  itemHeight: 20,
  itemsSpacing: 5,
  itemTextColor: '#fff',
  symbolSize: 10,
  symbolShape: 'circle',
} as const

export default function PieChart({ range, mode, token }: PieChartProps) {
  const showArcLabels = useMediaQuery('(min-width: 769px)')
  const data = useMemo(
    () => buildPieData(range.breakdown, mode, token),
    [range.breakdown, mode, token],
  )
  const theme = useMemo(() => nivoTheme(), [])
  const unit = token.toUpperCase()

  if (data.length === 0) {
    return (
      <div className={styles.pie}>
        <p className={styles.empty}>No data available</p>
      </div>
    )
  }

  const half = Math.ceil(data.length / 2)
  const legendItems = (slice: PieDatum[]) =>
    slice.map((d) => ({ id: d.id, label: d.label, color: pieBaseColor(d.id) }))

  const Tooltip = ({ datum }: PieTooltipProps<PieDatum>) => (
    <div
      className={styles.tooltip}
      style={{ color: pieBaseColor(datum.id), background: tooltipBackground() }}
    >
      <strong>
        {datum.label}: {formatToken(datum.value)} {unit}
      </strong>
      <div className={styles.tooltipMeta}>
        {datum.data.txCount.toLocaleString()}{' '}
        {datum.data.txCount === 1 ? 'transaction' : 'transactions'}
      </div>
    </div>
  )

  return (
    <div className={styles.pie}>
      <ResponsivePie<PieDatum>
        data={data}
        margin={{ top: 40, right: 0, bottom: showArcLabels ? 20 : 70, left: 0 }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        colors={(d) => pieColor(d.id)}
        borderWidth={1}
        borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
        enableArcLinkLabels={showArcLabels}
        arcLinkLabelsSkipAngle={0}
        arcLinkLabelsTextColor="#ffffff"
        arcLinkLabelsThickness={1}
        arcLinkLabelsColor={{ from: 'color' }}
        enableArcLabels={false}
        theme={theme}
        legends={
          showArcLabels
            ? []
            : [
                {
                  ...legendBase,
                  anchor: 'bottom-left',
                  itemWidth: 120,
                  data: legendItems(data.slice(0, half)),
                },
                {
                  ...legendBase,
                  anchor: 'bottom-right',
                  itemWidth: 80,
                  data: legendItems(data.slice(half)),
                },
              ]
        }
        tooltip={Tooltip}
      />
    </div>
  )
}
