'use client'

import { ResponsiveBar } from '@nivo/bar'

import { nivoColors, nivoTheme } from '~/lib/nivo'
import { ChartData, ChartTransaction } from '~/types'

function formatSaleData(transactions: ChartTransaction[]): {
  nftTypeData: ChartData[]
  transactionTypeData: ChartData[]
} {
  if (!Array.isArray(transactions))
    return { nftTypeData: [], transactionTypeData: [] }

  const nftTypeData = transactions.reduce(
    (acc, tx) => {
      if (tx.type !== 'sale' || tx.nft_type === 'No NFT Transfer') return acc

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

      acc[key][`${tx.type}_axs_fee`] =
        (acc[key][`${tx.type}_axs_fee`] as number) + parseFloat(tx.axs_fee)
      acc[key][`${tx.type}_weth_fee`] =
        (acc[key][`${tx.type}_weth_fee`] as number) + parseFloat(tx.weth_fee)

      return acc
    },
    {} as Record<string, ChartData>,
  )

  return {
    nftTypeData: Object.values(nftTypeData),
    transactionTypeData: Object.values(transactionTypeData),
  }
}

type BarChartProps = {
  data: ChartTransaction[]
  type: 'nftType' | 'transactionType'
  currency: 'axs' | 'weth'
}

export default function BarChart({ data, type, currency }: BarChartProps) {
  const { nftTypeData, transactionTypeData } = formatSaleData(data)
  const chartData = type === 'nftType' ? nftTypeData : transactionTypeData

  if (chartData.length === 0) {
    return <div>No data available</div>
  }

  // Collect all unique keys from chartData
  const allKeys = new Set<string>()
  chartData.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (key !== 'date' && key.includes(`${currency}_fee`)) {
        allKeys.add(key)
      }
    })
  })
  const filteredKeys = Array.from(allKeys)

  console.log('Filtered keys:', filteredKeys)

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
  }

  return (
    <div style={{ height: '500px' }}>
      <ResponsiveBar
        data={chartData}
        keys={filteredKeys}
        indexBy="date"
        margin={{ top: 50, right: 130, bottom: 20, left: 48 }}
        padding={0.3}
        valueScale={{ type: 'linear' }}
        indexScale={{ type: 'band', round: true }}
        colors={({ id }) => {
          const key = id.toString().split('_')[0].toLowerCase()
          return nivoColors.barChartColors[key] || '#fff'
        }}
        borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={null}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          format: (value) => value.toLocaleString(),
        }}
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
        ariaLabel={`Inflows by ${type === 'nftType' ? 'NFT Type' : 'Transaction Type'} (${currency.toUpperCase()})`}
        barAriaLabel={(e) => `${e.id}: ${e.formattedValue} in ${e.indexValue}`}
        theme={nivoTheme}
        tooltip={({ id, value, indexValue }) => (
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
              {new Date(indexValue).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
              })}
            </div>
            <strong>
              {legendTitleMap[id as string] || id}: {Number(value).toFixed(2)}{' '}
              {currency.toUpperCase()}
            </strong>
          </div>
        )}
      />
    </div>
  )
}