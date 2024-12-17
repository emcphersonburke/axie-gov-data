import PageContent from '~/components/PageContent/PageContent'
import { fetchTransactions } from '~/utils/fetchTransactions'

export const revalidate = 60

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
  // Fetch line chart data
  const today = new Date().toISOString().split('T')[0]
  const { transactions: lineTransactions, cumulativeTotals } =
    await fetchTransactions('1h', today, 'line')

  // Fetch pie chart data
  const { transactions: pieTransactions } = await fetchTransactions(
    '1h',
    today,
    'pie',
  )

  const exchangeRates = await fetchExchangeRates()

  return (
    <PageContent
      lineTransactions={lineTransactions}
      pieTransactions={pieTransactions}
      initialTotals={cumulativeTotals}
      exchangeRates={exchangeRates}
    />
  )
}
