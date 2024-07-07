import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'
import { AbiItem } from 'web3-utils'

import { axieInfinityAbi, axsTokenAbi, slpTokenAbi } from '~/lib/abi'
import { insertTransaction } from '~/lib/supabase'
import { Transaction } from '~/types'
import { fetchBlockTimestamp } from '~/utils/fetchBlockTimestamp'

export const dynamic = 'force-dynamic'

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)

const isAbiEventWithName = (item: any): item is AbiItem & { name: string } => {
  return (
    item.type === 'event' && 'name' in item && typeof item.name === 'string'
  )
}

const fetchLogsForContract = async (
  fromBlock: number,
  toBlock: number,
  contractAddress: string,
) => {
  const logsPayload = {
    jsonrpc: '2.0',
    method: 'eth_getLogs',
    params: [
      {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        address: contractAddress,
        topics: [],
      },
    ],
    id: 1,
  }

  const response = await axios.post(
    process.env.RONIN_API_ENDPOINT,
    logsPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.RONIN_API_KEY,
      },
    },
  )

  if (response.data.error) {
    throw new Error(response.data.error.message)
  }

  return response.data.result
}

const decodeLogs = (logs: any[], abi: AbiItem[], web3: Web3) => {
  const eventAbi = abi.filter(isAbiEventWithName)
  return logs
    .map((log) => {
      try {
        const event = eventAbi.find(
          (event) => web3.eth.abi.encodeEventSignature(event) === log.topics[0],
        )
        if (!event) {
          throw new Error('Event not found in ABI')
        }
        const decodedLog = web3.eth.abi.decodeLog(
          [...event.inputs] as any[],
          log.data,
          log.topics.slice(1),
        )

        if (
          event.name === 'Transfer' &&
          decodedLog._value &&
          abi === axsTokenAbi
        ) {
          decodedLog._value = web3.utils.fromWei(
            decodedLog._value.toString(),
            'ether',
          )
        }

        return {
          event: event.name,
          decodedLog,
          transactionHash: log.transactionHash,
        }
      } catch (error) {
        console.error('Error decoding log:', error)
        return null
      }
    })
    .filter((log) => log !== null)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fromBlockStr = searchParams.get('fromBlock')
  const toBlockStr = searchParams.get('toBlock')

  if (!fromBlockStr || !toBlockStr) {
    return new Response(
      JSON.stringify({ error: 'fromBlock and toBlock are required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const fromBlock = parseInt(fromBlockStr, 10)
  const toBlock = parseInt(toBlockStr, 10)

  try {
    const axieLogs = await fetchLogsForContract(
      fromBlock,
      toBlock,
      process.env.AXIE_PROXY_CONTRACT_ADDRESS,
    )
    const axsLogs = await fetchLogsForContract(
      fromBlock,
      toBlock,
      process.env.AXS_TOKEN_CONTRACT_ADDRESS,
    )
    const slpLogs = await fetchLogsForContract(
      fromBlock,
      toBlock,
      process.env.SLP_TOKEN_CONTRACT_ADDRESS,
    )

    const decodedAxieLogs = decodeLogs(axieLogs, axieInfinityAbi, web3)
    const decodedAxsLogs = decodeLogs(axsLogs, axsTokenAbi, web3)
    const decodedSlpLogs = decodeLogs(slpLogs, slpTokenAbi, web3)

    for (const decodedLog of decodedAxieLogs) {
      const { event, decodedLog: logDetails, transactionHash } = decodedLog

      if (['AxieEvolved', 'AxieMinted', 'AxieSpawn'].includes(event)) {
        // Fetch the transaction details to get the gas used and gas price
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
        const blockNumber = axieLogs.find(
          (log) => log.transactionHash === transactionHash,
        ).blockNumber

        const blockTimestamp = await fetchBlockTimestamp(blockNumber)

        const axsTransferLogs = decodedAxsLogs.filter(
          (log) => log.transactionHash === transactionHash,
        )

        const slpTransferLogs = decodedSlpLogs.filter(
          (log) => log.transactionHash === transactionHash,
        )

        const axsFee = axsTransferLogs.reduce(
          (acc, log) => acc + parseFloat(log.decodedLog._value as string),
          0,
        )

        const slpFee = slpTransferLogs.reduce(
          (acc, log) => acc + parseFloat(log.decodedLog._value as string),
          0,
        )

        const newTransaction: Transaction = {
          transaction_id: transactionHash,
          timestamp: new Date(
            parseInt(blockTimestamp, 16) * 1000,
          ).toISOString(),
          block: parseInt(blockNumber, 16),
          type: event,
          axs_fee: axsFee,
          slp_fee: slpFee,
          gas_used: parseInt(transaction.gasUsed, 16),
          gas_price: parseFloat(
            web3.utils.fromWei(transaction.effectiveGasPrice, 'gwei'),
          ),
        }

        console.log('newTransaction:', newTransaction)
        // await insertTransaction(newTransaction)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error fetching breeding transactions:', error)
    return new Response(
      JSON.stringify({ error: 'Error fetching breeding transactions' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}
