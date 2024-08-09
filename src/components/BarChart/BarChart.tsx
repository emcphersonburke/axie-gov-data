'use client'

import { ResponsiveBar } from '@nivo/bar'

import { nivoColors, nivoTheme } from '~/lib/nivo'
import { ChartData, ChartTransaction } from '~/types'

import ChartTick from '../ChartTick/ChartTick'

type BarChartProps = {
  data: ChartTransaction[]
  displayTime: boolean
  type: 'nftType' | 'transactionType'
  currency: 'axs' | 'weth'
}

function formatSaleData(transactions: ChartTransaction[]): {
  nftTypeData: ChartData[]
  transactionTypeData: ChartData[]
} {
  if (!Array.isArray(transactions))
    return { nftTypeData: [], transactionTypeData: [] }

  const nftTypeData = transactions.reduce(
    (acc, tx, index) => {
      if (tx.type !== 'sale' || tx.nft_type === 'No NFT Transfer') return acc

      const key = tx.date

      if (!acc[key]) {
        acc[key] = { date: key, index }
      }

      if (!acc[key][`${tx.nft_type}_axs_fee`]) {
        acc[key][`${tx.nft_type}_axs_fee`] = 0
      }

      if (!acc[key][`${tx.nft_type}_weth_fee`]) {
        acc[key][`${tx.nft_type}_weth_fee`] = 0
      }

      acc[key][`${tx.nft_type}_axs_fee`] =
        (acc[key][`${tx.nft_type}_axs_fee`] as number) + parseFloat(tx.axs_fee)
      acc[key][`${tx.nft_type}_weth_fee`] =
        (acc[key][`${tx.nft_type}_weth_fee`] as number) +
        parseFloat(tx.weth_fee)

      return acc
    },
    {} as Record<string, ChartData>,
  )

  const transactionTypeData = transactions.reduce(
    (acc, tx, index) => {
      const key = tx.date

      if (!acc[key]) {
        acc[key] = { date: key, index }
      }

      if (!acc[key][`${tx.type}_axs_fee`]) {
        acc[key][`${tx.type}_axs_fee`] = 0
      }

      if (!acc[key][`${tx.type}_weth_fee`]) {
        acc[key][`${tx.type}_weth_fee`] = 0
      }

      acc[key][`${tx.type}_axs_fee`] =
        (acc[key][`${tx.type}_axs_fee`] as number) + parseFloat(tx.axs_fee)
      acc[key][`${tx.type}_weth_fee`] =
        (acc[key][`${tx.type}_weth_fee`] as number) + parseFloat(tx.weth_fee)

      return acc
    },
    {} as Record<string, ChartData>,
  )

  return {
    nftTypeData: Object.values(nftTypeData).sort((a, b) => a.index - b.index),
    transactionTypeData: Object.values(transactionTypeData).sort(
      (a, b) => a.index - b.index,
    ),
  }
}

export default function BarChart({
  data,
  type,
  currency,
  displayTime,
}: BarChartProps) {
  const { nftTypeData, transactionTypeData } = formatSaleData(data)
  const chartData = type === 'nftType' ? nftTypeData : transactionTypeData

  if (chartData.length === 0) {
    return <div>No data available</div>
  }

  // Collect all unique keys from chartData
  const allKeys = new Set<string>()
  chartData.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (
        key !== 'date' &&
        key !== 'index' &&
        key.includes(`${currency}_fee`)
      ) {
        allKeys.add(key)
      }
    })
  })
  const filteredKeys = Array.from(allKeys).sort() // Ensure keys are sorted

  // Map keys to friendly names for the legend
  const legendTitleMap: { [key: string]: string } = {
    ascension_axs_fee: 'Ascension',
    breeding_axs_fee: 'Breeding',
    breeding_weth_fee: 'Breeding',
    evolution_axs_fee: 'Evolution',
    Axie_weth_fee: 'Axie',
    Material_weth_fee: 'Material',
    Land_weth_fee: 'Land',
    Rune_weth_fee: 'Rune',
    'Land Item_weth_fee': 'Land Item',
    Charm_weth_fee: 'Charm',
    sale_axs_fee: 'Marketplace',
    'rc-mint_axs_fee': 'R&C Mint',
    Accessory_weth_fee: 'Accessory',
  }

  return (
    <div style={{ height: '500px' }}>
      <ResponsiveBar
        data={chartData}
        keys={filteredKeys}
        indexBy="date"
        margin={{ top: 50, right: 130, bottom: 40, left: 48 }}
        padding={0.3}
        valueScale={{ type: 'linear' }}
        indexScale={{ type: 'band', round: true }}
        colors={({ id }) => {
          const key = id.toString().split('_')[0].toLowerCase()
          return nivoColors.barChartColors[key] + 'dd' || '#fff'
        }}
        borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          renderTick: ChartTick,
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          format: (value) => {
            const date = new Date(value)
            const dateStr = date.toLocaleDateString(undefined, {
              month: 'numeric',
              day: 'numeric',
              year: '2-digit',
            })
            const timeStr = date.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: 'numeric',
              hour12: false,
            })

            return displayTime ? `${dateStr}\n${timeStr}` : dateStr
          },
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          format: (value) => value.toLocaleString(),
        }}
        layout={'vertical'}
        enableLabel={false} // Disable labels on the bars
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
            data: filteredKeys.map((key) => ({
              id: key,
              label: legendTitleMap[key] || key,
              color: nivoColors.barChartColors[key.split('_')[0].toLowerCase()],
            })),
          },
        ]}
        role="application"
        ariaLabel={`Inflows by ${
          type === 'nftType' ? 'NFT Type' : 'Transaction Type'
        } (${currency.toUpperCase()})`}
        barAriaLabel={(e) => `${e.id}: ${e.formattedValue} in ${e.indexValue}`}
        theme={nivoTheme}
        tooltip={({ id, value, indexValue }) => {
          const date = new Date(indexValue)
          const dateStr = date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
          const timeStr = date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          })

          return (
            <div
              style={{
                color:
                  nivoColors.barChartColors[
                    id.toString().split('_')[0].toLowerCase()
                  ],
                background: '#1c1f25',
                padding: '5px',
                borderRadius: '3px',
              }}
            >
              <div style={{ fontSize: '0.8rem' }}>
                {timeStr === '0:00' ? dateStr : `${dateStr} ${timeStr}`}
              </div>
              <strong>
                {legendTitleMap[id as string] || id}: {Number(value).toFixed(4)}{' '}
                {currency.toUpperCase()}
              </strong>
            </div>
          )
        }}
      />
    </div>
  )
}
