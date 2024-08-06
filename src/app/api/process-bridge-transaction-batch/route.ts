import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'

import { roninGatewayAbi, wethTokenAbi } from '~/lib/abis/'
import {
  getMetaValue,
  setMetaValue,
  upsertBlock,
  upsertGatewayTransaction,
} from '~/lib/supabase'
import {
  depositedTopic,
  transferTopic,
  withdrawalRequestedTopic,
} from '~/lib/topics'
import { GatewayTransaction } from '~/types'
import {
  decodeLogs,
  fetchBlockTimestamp,
  fetchLogsForBlockRange,
} from '~/utils'

// Configure dynamic execution and set max duration for the function
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Kick up the max execution time

// Initialize Web3 instance and set gateway address
const web3 = new Web3(process.env.RONIN_API_ENDPOINT)
const gatewayAddress = process.env.RONIN_GATEWAY_ADDRESS.toLowerCase()

// Main handler for GET request to fetch and process blockchain logs
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let fromBlockStr = searchParams.get('fromBlock')
  let toBlockStr = searchParams.get('toBlock')

  // Determine block range if not provided
  if (!fromBlockStr || !toBlockStr) {
    if (!fromBlockStr) {
      const lastProcessedBlock = await getMetaValue(
        'last_processed_bridge_block',
      )
      fromBlockStr = lastProcessedBlock
      // Uncomment the below if starting with an empty database
      // fromBlockStr = lastProcessedBlock
      //   ? lastProcessedBlock
      //   : process.env.RONIN_GATEWAY_FIRST_REAL_TX_BLOCK || '0' // Use default if no last block found
    }

    if (!toBlockStr) {
      const blockInterval = 200
      toBlockStr = (parseInt(fromBlockStr, 10) + blockInterval).toString() // Set range to 20 blocks
    }
  }

  const fromBlock = parseInt(fromBlockStr, 10)
  const toBlock = parseInt(toBlockStr, 10)

  try {
    // Fetch logs for the specified block range
    const logs = await fetchLogsForBlockRange(fromBlock, toBlock)

    // console.log(`Fetched logs for blocks ${fromBlock} to ${toBlock}`)
    // console.log(logs)
    // return new Response(
    //   JSON.stringify({ success: true, message: 'No logs found' }),
    //   {
    //     status: 200,
    //     headers: { 'Content-Type': 'application/json' },
    //   },
    // )

    if (logs.length === 0) {
      // Update last processed block if no relevant logs found
      await setMetaValue('last_processed_bridge_block', toBlock.toString())
      return new Response(
        JSON.stringify({ success: true, message: 'No logs found' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Filter logs for relevant contract addresses
    const filteredLogs = logs.filter(
      (log) =>
        log.address === process.env.WETH_TOKEN_CONTRACT_ADDRESS.toLowerCase() ||
        log.address === gatewayAddress,
    )

    // Decode logs based on their topics and respective ABI
    const decodedWethLogs = decodeLogs(
      filteredLogs.filter(
        (log) =>
          log.address === process.env.WETH_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      ),
      wethTokenAbi,
      web3,
    )
    const decodedDepositedLogs = decodeLogs(
      filteredLogs.filter((log) => log.topics.includes(depositedTopic)),
      roninGatewayAbi,
      web3,
    )
    const decodedWithdrawalRequestedLogs = decodeLogs(
      filteredLogs.filter((log) =>
        log.topics.includes(withdrawalRequestedTopic),
      ),
      roninGatewayAbi,
      web3,
    )

    // Combine and organize logs by transaction hash
    const combinedLogs = [
      ...decodedWethLogs,
      ...decodedDepositedLogs,
      ...decodedWithdrawalRequestedLogs,
    ]

    const logsByTransaction: { [key: string]: any[] } = {}
    combinedLogs.forEach((log) => {
      if (!logsByTransaction[log.transactionHash]) {
        logsByTransaction[log.transactionHash] = []
      }
      logsByTransaction[log.transactionHash].push(log)
    })

    // Filter transactions to include only those with specific event combinations
    const filteredTransactions = Object.entries(logsByTransaction).filter(
      ([, logs]) =>
        logs.some((log) => log.event === 'Transfer') &&
        logs.some(
          (log) =>
            log.event === 'Deposited' || log.event === 'WithdrawalRequested',
        ),
    )

    for (const [transactionHash, logs] of filteredTransactions) {
      /* Temporarily disabled 
      // Prepare payload to fetch transaction receipt
      const transactionPayload = {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [transactionHash],
        id: 1,
      }

      // Fetch transaction receipt from the API
      const transactionResponse = await axios.post(
        process.env.RONIN_API_ENDPOINT,
        transactionPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.RONIN_API_KEY,
          },
        },
      )

      const transaction = transactionResponse.data.result
      if (!transaction) {
        console.error(`Transaction not found for hash: ${transactionHash}`)
        continue
      } 

      const blockTimestamp = await fetchBlockTimestamp(transaction.blockNumber)
      */

      const blockNumberHex = logs[0].blockNumber
      const blockNumber = parseInt(blockNumberHex, 16)

      // Add the block to the database if it doesn't exist
      await upsertBlock(blockNumber)

      let type = 'unknown'
      let address = ''
      let amount = '0'

      // Determine transaction type and details based on logs
      logs.forEach((log) => {
        const { event, decodedLog, contractAddress } = log

        if (
          event === 'Transfer' &&
          contractAddress === process.env.WETH_TOKEN_CONTRACT_ADDRESS
        ) {
          const fromAddress = decodedLog._from.toLowerCase()
          const toAddress = decodedLog._to.toLowerCase()

          if (fromAddress === gatewayAddress) {
            address = toAddress
          } else if (toAddress === gatewayAddress) {
            address = fromAddress
          }

          amount = decodedLog._value.toString()
        } else if (event === 'Deposited') {
          type = 'deposit'
        } else if (event === 'WithdrawalRequested') {
          type = 'withdrawal'
        }
      })

      // Create a new transaction object to upsert into the database
      const newTransaction: GatewayTransaction = {
        transaction_id: transactionHash,
        block: blockNumber,
        amount,
        type,
        address,
      }

      await upsertGatewayTransaction(newTransaction)
    }

    await setMetaValue('last_processed_bridge_block', toBlock.toString())

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return new Response(
      JSON.stringify({ error: 'Error fetching transactions' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}
