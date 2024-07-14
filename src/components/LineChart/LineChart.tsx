'use client'

import { ResponsiveLine } from '@nivo/line'

import { nivoColors, nivoTheme } from '~/lib/nivo'
import { ChartData, ChartTransaction } from '~/types'

import styles from './LineChart.module.scss'

function calculateCumulativeTotals(
  transactions: ChartTransaction[],
  filter: 'axs' | 'weth',
  startDate: string,
  cumulativeTotals: { axs: number; weth: number },
): { cumulativeData: ChartData[]; filteredData: ChartData[] } {
  if (!Array.isArray(transactions))
    return { cumulativeData: [], filteredData: [] }

  let cumulativeAxs = cumulativeTotals.axs
  let cumulativeWeth = cumulativeTotals.weth

  const groupedData = transactions.reduce(
    (acc, tx) => {
      const key = tx.date

      if (!acc[key]) {
        acc[key] = { date: key }
      }

      cumulativeAxs += parseFloat(tx.axs_fee)
      cumulativeWeth += parseFloat(tx.weth_fee)

      acc[key]['cumulative_axs'] = cumulativeAxs
      acc[key]['cumulative_weth'] = cumulativeWeth

      return acc
    },
    {} as Record<string, ChartData>,
  )

  const cumulativeData = Object.values(groupedData)

  const filteredData = cumulativeData.filter((item) => {
    if (filter === 'axs') {
      return parseFloat(item.cumulative_axs as string) > 0
    } else {
      return parseFloat(item.cumulative_weth as string) > 0
    }
  })

  return { cumulativeData, filteredData }
}

type LineChartProps = {
  data: ChartTransaction[]
  filter: 'axs' | 'weth'
  yAxisLabel?: string
  type?: string
  startDate: string
  cumulativeTotals: { axs: number; weth: number }
}

export default function LineChart({
  data,
  filter,
  yAxisLabel,
  type,
  startDate,
  cumulativeTotals,
}: LineChartProps) {
  const { cumulativeData, filteredData } = calculateCumulativeTotals(
    data,
    filter,
    startDate,
    cumulativeTotals,
  )

  if (filteredData.length === 0) {
    return <div>No data available</div>
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>{filter.toUpperCase()}</h3>
      <div style={{ height: '300px' }}>
        <ResponsiveLine
          data={[
            {
              id: filter.toUpperCase(),
              data: filteredData.map((item) => ({
                x: item.date,
                y:
                  filter === 'axs' ? item.cumulative_axs : item.cumulative_weth,
              })),
            },
          ]}
          margin={{ top: 12, right: 48, bottom: 48, left: 8 }}
          xScale={{ type: 'point' }}
          yScale={{
            type: 'linear',
            min: 'auto',
            max: 'auto',
            stacked: true,
            reverse: false,
          }}
          curve="monotoneX"
          axisTop={null}
          axisRight={null}
          axisBottom={null}
          axisLeft={null}
          colors={nivoColors[type]}
          enableCrosshair={false}
          theme={nivoTheme}
          enablePoints={false}
          pointColor={{ theme: 'background' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'serieColor' }}
          pointLabelYOffset={-12}
          enableArea={true}
          areaOpacity={0.3}
          useMesh={true}
          enableGridX={false}
          enableGridY={false}
          tooltip={({ point }) => (
            <div
              style={{
                color: point.serieColor,
                background: '#1c1f25',
                padding: '5px',
                borderRadius: '3px',
              }}
            >
              <div style={{ fontSize: '0.8rem' }}>
                {new Date(point.data.xFormatted).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                })}
              </div>
              <strong>
                {`${Number(point.data.yFormatted).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${filter.toUpperCase()}`}
              </strong>
            </div>
          )}
        />
      </div>
    </div>
  )
}
