'use client'

import { ResponsiveBar } from '@nivo/bar'
import { ResponsiveLine } from '@nivo/line'
import { useEffect, useState } from 'react'

import { ChartData, ChartTransaction } from '~/types'

async function fetchTransactions(groupBy: string): Promise<ChartTransaction[]> {
  const response = await fetch(`/api/fetch-transactions?groupBy=${groupBy}`)
  const data: ChartTransaction[] = await response.json()
  return data
}

function formatData(transactions: ChartTransaction[]): ChartData[] {
  const groupedData = transactions.reduce(
    (acc, tx) => {
      const key = tx.date

      if (!acc[key]) {
        acc[key] = { date: key }
      }

      if (!acc[key][`${tx.type}_axs_fee`]) {
        acc[key][`${tx.type}_axs_fee`] = 0
      }

      if (!acc[key][`${tx.type}_weth_fee`]) {
        acc[key][`${tx.type}_weth_fee`] = 0
      }

      ;(acc[key][`${tx.type}_axs_fee`] as number) += tx.axs_fee
      ;(acc[key][`${tx.type}_weth_fee`] as number) += tx.weth_fee
      return acc
    },
    {} as Record<string, ChartData>,
  )

  return Object.values(groupedData)
}

function formatSaleData(transactions: ChartTransaction[]): ChartData[] {
  const groupedData = transactions.reduce(
    (acc, tx) => {
      if (tx.type !== 'sale') return acc

      const key = tx.date

      if (!acc[key]) {
        acc[key] = { date: key }
      }

      if (!acc[key][`${tx.nft_type}_axs_fee`]) {
        acc[key][`${tx.nft_type}_axs_fee`] = 0
      }

      if (!acc[key][`${tx.nft_type}_weth_fee`]) {
        acc[key][`${tx.nft_type}_weth_fee`] = 0
      }

      ;(acc[key][`${tx.nft_type}_axs_fee`] as number) += tx.axs_fee
      ;(acc[key][`${tx.nft_type}_weth_fee`] as number) += tx.weth_fee

      return acc
    },
    {} as Record<string, ChartData>,
  )

  return Object.values(groupedData)
}

export default function Chart({
  initialTransactions,
}: {
  initialTransactions: ChartTransaction[]
}) {
  const [groupBy, setGroupBy] = useState('daily')
  const [data, setData] = useState<ChartTransaction[]>(initialTransactions)

  useEffect(() => {
    async function fetchData() {
      const newTransactions = await fetchTransactions(groupBy)
      setData(newTransactions)
    }
    fetchData()
  }, [groupBy])

  const inflowsData = formatData(data)
  const salesData = formatSaleData(data)

  return (
    <div>
      <div>
        <button onClick={() => setGroupBy('daily')}>Daily</button>
        <button onClick={() => setGroupBy('weekly')}>Weekly</button>
        <button onClick={() => setGroupBy('monthly')}>Monthly</button>
      </div>
      <div style={{ height: '500px' }}>
        <h2>Inflows by Type</h2>
        <ResponsiveLine
          data={Object.keys(inflowsData[0])
            .filter((k) => k !== 'date')
            .map((key) => ({
              id: key,
              data: inflowsData.map((item) => ({
                x: item.date,
                y: (item[key] as number) || 0,
              })),
            }))}
          margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
          xScale={{ type: 'point' }}
          yScale={{
            type: 'linear',
            min: 'auto',
            max: 'auto',
            stacked: true,
            reverse: false,
          }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            legend: 'Date',
            legendOffset: 36,
            legendPosition: 'middle',
          }}
          axisLeft={{
            legend: 'Fee',
            legendOffset: -40,
            legendPosition: 'middle',
          }}
          colors={{ scheme: 'nivo' }}
          pointSize={10}
          pointColor={{ theme: 'background' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'serieColor' }}
          pointLabelYOffset={-12}
          useMesh={true}
          legends={[
            {
              anchor: 'bottom-right',
              direction: 'column',
              justify: false,
              translateX: 100,
              translateY: 0,
              itemsSpacing: 0,
              itemDirection: 'left-to-right',
              itemWidth: 80,
              itemHeight: 20,
              itemOpacity: 0.75,
              symbolSize: 12,
              symbolShape: 'circle',
              symbolBorderColor: 'rgba(0, 0, 0, .5)',
              effects: [
                {
                  on: 'hover',
                  style: {
                    itemBackground: 'rgba(0, 0, 0, .03)',
                    itemOpacity: 1,
                  },
                },
              ],
            },
          ]}
        />
      </div>
      <div style={{ height: '500px' }}>
        <h2>Sales by NFT Type</h2>
        <ResponsiveBar
          data={salesData}
          keys={Object.keys(salesData[0]).filter((k) => k !== 'date')}
          indexBy="date"
          margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
          padding={0.3}
          valueScale={{ type: 'linear' }}
          indexScale={{ type: 'band', round: true }}
          colors={{ scheme: 'nivo' }}
          defs={[
            {
              id: 'dots',
              type: 'patternDots',
              background: 'inherit',
              color: '#38bcb2',
              size: 4,
              padding: 1,
              stagger: true,
            },
            {
              id: 'lines',
              type: 'patternLines',
              background: 'inherit',
              color: '#eed312',
              rotation: -45,
              lineWidth: 6,
              spacing: 10,
            },
          ]}
          fill={[
            {
              match: {
                id: 'fries',
              },
              id: 'dots',
            },
            {
              match: {
                id: 'sandwich',
              },
              id: 'lines',
            },
          ]}
          borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: 'Date',
            legendPosition: 'middle',
            legendOffset: 32,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: 'Fee',
            legendPosition: 'middle',
            legendOffset: -40,
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
          legends={[
            {
              dataFrom: 'keys',
              anchor: 'bottom-right',
              direction: 'column',
              justify: false,
              translateX: 120,
              translateY: 0,
              itemsSpacing: 2,
              itemWidth: 100,
              itemHeight: 20,
              itemDirection: 'left-to-right',
              itemOpacity: 0.85,
              symbolSize: 20,
              effects: [
                {
                  on: 'hover',
                  style: {
                    itemOpacity: 1,
                  },
                },
              ],
            },
          ]}
          role="application"
          ariaLabel="Sales by NFT type"
          barAriaLabel={(e) =>
            `${e.id}: ${e.formattedValue} in ${e.indexValue}`
          }
        />
      </div>
    </div>
  )
}
