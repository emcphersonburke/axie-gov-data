import { ReactNode, useEffect, useState } from 'react'

import { ChartTransaction } from '~/types'

import styles from './ChartGroup.module.scss'

type ChartGroupProps = {
  title: string
  initialData: ChartTransaction[]
  initialTotals: { axs: number; weth: number }
  children: (
    data: ChartTransaction[],
    startDate: string,
    cumulativeTotals: { axs: number; weth: number },
  ) => ReactNode
}

export default function ChartGroup({
  title,
  initialData = [],
  initialTotals = { axs: 0, weth: 0 },
  children,
}: ChartGroupProps) {
  const [timeRange, setTimeRange] = useState('24H')
  const [data, setData] = useState<ChartTransaction[]>(initialData)
  const [startDate, setStartDate] = useState('')
  const [cumulativeTotals, setCumulativeTotals] = useState(initialTotals)

  console.log('totals', cumulativeTotals, initialData.length)

  const fetchData = async (range: string) => {
    let groupBy
    let calculatedStartDate = new Date('2024-06-17')

    switch (range) {
      case '24H':
        groupBy = '30m'
        calculatedStartDate.setDate(calculatedStartDate.getDate() - 1)
        break
      case '7D':
        groupBy = '3h'
        calculatedStartDate.setDate(calculatedStartDate.getDate() - 7)
        break
      case '30D':
        groupBy = 'daily'
        calculatedStartDate.setDate(calculatedStartDate.getDate() - 30)
        break
      case '6M':
        groupBy = 'weekly'
        calculatedStartDate.setMonth(calculatedStartDate.getMonth() - 6)
        break
      case '1Y':
        groupBy = 'weekly'
        calculatedStartDate.setFullYear(calculatedStartDate.getFullYear() - 1)
        break
      case 'ALL':
        groupBy = 'monthly'
        calculatedStartDate = new Date('1970-01-01')
        break
      default:
        groupBy = 'daily'
        calculatedStartDate.setDate(calculatedStartDate.getDate() - 30)
        break
    }

    setStartDate(calculatedStartDate.toISOString().split('T')[0])

    try {
      const response = await fetch(
        `/api/fetch-transactions?groupBy=${groupBy}&startDate=${calculatedStartDate.toISOString()}`,
      )
      const { transactions, cumulativeTotals } = await response.json()
      setData(transactions)
      setCumulativeTotals(cumulativeTotals)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const handleRangeChange = (range: string) => {
    setTimeRange(range)
    fetchData(range)
  }

  return (
    <div className={styles.chartGroup}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.controls}>
        {['24H', '7D', '30D', '6M', '1Y', 'ALL'].map((range) => (
          <button
            key={range}
            className={timeRange === range ? styles.active : ''}
            onClick={() => handleRangeChange(range)}
          >
            {range}
          </button>
        ))}
      </div>
      <div className={styles.chartWrapper}>
        {children(data, startDate, cumulativeTotals)}
      </div>
    </div>
  )
}
