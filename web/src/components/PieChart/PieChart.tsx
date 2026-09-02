'use client'

import { ResponsivePie } from '@nivo/pie'
import { useEffect, useState } from 'react'

import { nivoColors, nivoTheme } from '~/lib/nivo'
import { ChartData, ChartTransaction } from '~/types'

type PieChartProps = {
  data: ChartTransaction[]
  type: 'nftType' | 'transactionType'
  currency: 'axs' | 'weth'
}

// Define a mapping for custom labels
const labelMap: Record<string, string> = {
  ascension: 'Ascension',
  atiablessing: 'Blessing Streak Restore',
  breeding: 'Breeding',
  evolution: 'Evolution',
  'rc-mint': '', // Will be set dynamically based on nft_type
  sale: 'Marketplace Sale',
}

function formatPieData(
  transactions: ChartTransaction[],
  type: string,
  currency: string,
): ChartData[] {
  const dataMap: Record<string, number> = {}

  transactions.forEach((tx) => {
    let keyField = type === 'nftType' ? tx.nft_type : tx.type

    if (!keyField || keyField === 'No NFT Transfer') {
      return
    }

    // Determine label based on type and nft_type
    let label = labelMap[keyField] || keyField

    // Specific case for rc-mint based on nft_type
    if (tx.type === 'rc-mint' && type === 'transactionType') {
      if (tx.nft_type === 'Rune') {
        label = 'Rune Mint'
      } else if (tx.nft_type === 'Charm') {
        label = 'Charm Mint'
      }
    }

    const key = `${label}_${currency}_fee`

    if (!dataMap[key]) {
      dataMap[key] = 0
    }
    dataMap[key] += parseFloat(tx[`${currency}_fee`])
  })

  return Object.keys(dataMap)
    .filter((key) => dataMap[key] > 0)
    .filter((key) => key.split('_')[0] !== 'direct')
    .map((key) => ({
      id: key.split('_')[0],
      label: key.split('_')[0],
      value: dataMap[key],
    }))
}

export default function PieChart({ data, type, currency }: PieChartProps) {
  const [showArcLabels, setShowArcLabels] = useState(true)

  useEffect(() => {
    // Function to determine if arc labels should be shown
    const handleResize = () => {
      // Set the breakpoint for when to switch to legend
      setShowArcLabels(window.innerWidth > 768)
    }

    // Initial check
    handleResize()

    // Add event listener for window resize
    window.addEventListener('resize', handleResize)

    // Clean up the event listener on component unmount
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const chartData = formatPieData(data, type, currency)

  if (chartData.length === 0) {
    return <div>No data available</div>
  }

  // Sort chart data alphabetically by label
  const sortedChartData = chartData.sort((a, b) =>
    (a.label as string).localeCompare(b.label as string),
  )

  return (
    <div style={{ height: '500px' }}>
      <ResponsivePie
        data={sortedChartData}
        margin={{
          top: 40,
          right: 0,
          bottom: showArcLabels ? 20 : 70,
          left: 0,
        }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        colors={({ id }) => {
          const color = nivoColors.pieChartColors[id.toString().toLowerCase()]
          return color + 'dd'
        }}
        borderWidth={1}
        borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
        enableArcLinkLabels={showArcLabels}
        arcLinkLabelsSkipAngle={0}
        arcLinkLabelsTextColor="#ffffff"
        arcLinkLabelsThickness={1}
        arcLinkLabelsColor={{ from: 'color' }}
        enableArcLabels={false}
        theme={nivoTheme}
        legends={
          showArcLabels
            ? []
            : [
                {
                  anchor: 'bottom-left',
                  direction: 'column',
                  translateY: 65,
                  itemWidth: 120,
                  itemHeight: 20,
                  itemsSpacing: 5,
                  itemTextColor: '#fff',
                  symbolSize: 10,
                  symbolShape: 'circle',
                  data: sortedChartData
                    .slice(0, Math.ceil(sortedChartData.length / 2))
                    .map((cur) => ({
                      id: cur.id,
                      label: cur.label,
                      color:
                        nivoColors.pieChartColors[
                          (cur.id as string).toLowerCase()
                        ],
                    })),
                },
                {
                  anchor: 'bottom-right',
                  direction: 'column',
                  translateY: 65,
                  itemWidth: 80,
                  itemHeight: 20,
                  itemsSpacing: 5,
                  itemTextColor: '#fff',
                  symbolSize: 10,
                  symbolShape: 'circle',
                  data: sortedChartData
                    .slice(Math.ceil(sortedChartData.length / 2))
                    .map((cur) => ({
                      id: cur.id,
                      label: cur.label,
                      color:
                        nivoColors.pieChartColors[
                          (cur.id as string).toLowerCase()
                        ],
                    })),
                },
              ]
        }
        tooltip={({ datum }) => (
          <div
            style={{
              color:
                nivoColors.pieChartColors[
                  datum.id.toString().split('_')[0].toLowerCase()
                ],
              background: '#1c1f25',
              padding: '5px',
              borderRadius: '3px',
            }}
          >
            <strong>
              {datum.label}:{' '}
              {Number(datum.value).toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{' '}
              {currency.toUpperCase()}
            </strong>
          </div>
        )}
      />
    </div>
  )
}
