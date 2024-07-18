// app/page.tsx
import { createClient } from '@supabase/supabase-js'

import PageContent from '~/components/PageContent/PageContent'
import { fetchTransactions } from '~/utils/fetchTransactions'

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
  const { transactions, cumulativeTotals } = await fetchTransactions(
    '30m',
    '2024-06-16',
  )
  const exchangeRates = await fetchExchangeRates()

  return (
    <PageContent
      initialTransactions={transactions}
      initialTotals={cumulativeTotals}
      exchangeRates={exchangeRates}
    />
  )
}
