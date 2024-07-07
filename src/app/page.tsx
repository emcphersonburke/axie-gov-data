'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    async function loadTransactions() {
      const response = await fetch(
        '/api/process-transaction-batch?fromBlock=36100768&toBlock=36100768',
      )
      const data = await response.json()
      setTransactions(data)
    }
    loadTransactions()
  }, [])

  return (
    <div>
      <h1>Breeding Transactions</h1>
      <pre>{JSON.stringify(transactions, null, 2)}</pre>
    </div>
  )
}
