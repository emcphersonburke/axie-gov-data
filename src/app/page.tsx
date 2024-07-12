'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    async function loadTransactions() {
      const response = await fetch(
        '/api/process-bridge-transaction-batch?fromBlock=36277624&toBlock=36277624',
        // '/api/process-transaction-batch?fromBlock=17950097&toBlock=17950097',
      )
      const data = await response.json()
      setTransactions(data)
    }
    loadTransactions()
  }, [])

  return (
    <div>
      <h1>TX</h1>
      <pre>{JSON.stringify(transactions, null, 2)}</pre>
    </div>
  )
}
