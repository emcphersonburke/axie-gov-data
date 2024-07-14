// app/page.tsx
import { createClient } from '@supabase/supabase-js'

import PageContent from '~/components/PageContent/PageContent'
import { ChartTransaction } from '~/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function fetchTransactions(
  groupBy = 'daily',
): Promise<ChartTransaction[]> {
  let view
  if (groupBy === 'daily') {
    view = 'daily_aggregated_transactions'
  } else if (groupBy === 'weekly') {
    view = 'weekly_aggregated_transactions'
  } else if (groupBy === 'monthly') {
    view = 'monthly_aggregated_transactions'
  }

  const { data, error } = await supabase.from(view).select('*')

  if (error) {
    throw new Error(error.message)
  }

  return data as ChartTransaction[]
}

async function fetchExchangeRates() {
  const response = await fetch(
    'https://api-gateway.skymavis.com/graphql/marketplace',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.RONIN_API_KEY,
      },
      body: JSON.stringify({
        query: `
        query GetExchangeRates {
          exchangeRate {
            axs {
              usd
            }
            eth {
              usd
            }
          }
        }
      `,
      }),
    },
  )

  const json = await response.json()
  const { axs, eth } = json.data.exchangeRate

  return {
    axs: axs.usd,
    eth: eth.usd,
  }
}

export default async function Page() {
  const initialTransactions = await fetchTransactions('daily') // default to daily for now
  const exchangeRates = await fetchExchangeRates()

  return (
    <PageContent
      initialTransactions={initialTransactions}
      exchangeRates={exchangeRates}
    />
  )
}
