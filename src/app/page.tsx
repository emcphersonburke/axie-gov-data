'use client'

// import { useEffect, useState } from 'react'

export default function Home() {
  return <h1>Hackathon</h1>
  // const [transactions, setTransactions] = useState([])

  // useEffect(() => {
  //   async function loadTransactions() {
  //     const response = await fetch(
  //       '/api/process-transaction-batch?fromBlock=35695959&toBlock=35695959',
  //       // '/api/process-transaction-batch?fromBlock=36163174&toBlock=36163174',
  //     )
  //     const data = await response.json()
  //     setTransactions(data)
  //   }
  //   loadTransactions()
  // }, [])

  // return (
  //   <div>
  //     <h1>TX</h1>
  //     <pre>{JSON.stringify(transactions, null, 2)}</pre>
  //   </div>
  // )
}
