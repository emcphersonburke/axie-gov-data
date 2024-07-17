import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'

import { roninGatewayAbi, wethTokenAbi } from '~/lib/abis/'
import {
  getMetaValue,
  setMetaValue,
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

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Kick up the max execution time

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)
const gatewayAddress = process.env.RONIN_GATEWAY_ADDRESS.toLowerCase()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let fromBlockStr = searchParams.get('fromBlock')
  let toBlockStr = searchParams.get('toBlock')

  if (!fromBlockStr || !toBlockStr) {
    if (!fromBlockStr) {
      const lastProcessedBlock = await getMetaValue(
        'last_processed_bridge_block',
      )
      fromBlockStr = lastProcessedBlock
        ? lastProcessedBlock
        : process.env.RONIN_GATEWAY_FIRST_REAL_TX_BLOCK || '0'
    }

    if (!toBlockStr) {
      const blockInterval = 20
      toBlockStr = (parseInt(fromBlockStr, 10) + blockInterval).toString()
    }
  }

  const fromBlock = parseInt(fromBlockStr, 10)
  const toBlock = parseInt(toBlockStr, 10)

  try {
    const logs = await fetchLogsForBlockRange(fromBlock, toBlock)

    if (logs.length === 0) {
      await setMetaValue('last_processed_bridge_block', toBlock.toString())
      return new Response(
        JSON.stringify({ success: true, message: 'No logs found' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const filteredLogs = logs.filter(
      (log) =>
        log.address === process.env.WETH_TOKEN_CONTRACT_ADDRESS.toLowerCase() ||
        log.address === gatewayAddress,
    )

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

    const filteredTransactions = Object.entries(logsByTransaction).filter(
      ([, logs]) =>
        logs.some((log) => log.event === 'Transfer') &&
        logs.some(
          (log) =>
            log.event === 'Deposited' || log.event === 'WithdrawalRequested',
        ),
    )

    for (const [transactionHash, logs] of filteredTransactions) {
      const transactionPayload = {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [transactionHash],
        id: 1,
      }

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

      let type = 'unknown'
      let address = ''
      let amount = '0'

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

      const newTransaction: GatewayTransaction = {
        transaction_id: transactionHash,
        block: parseInt(transaction.blockNumber, 16),
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
