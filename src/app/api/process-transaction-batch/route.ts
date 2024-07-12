import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'

import {
  axieInfinityAbi,
  axsTokenAbi,
  charmTokenAbi,
  landItemTokenAbi,
  landTokenAbi,
  partEvolutionAbi,
  runeTokenAbi,
  wethTokenAbi,
} from '~/lib/abis/'
import { getMetaValue, setMetaValue, upsertTransaction } from '~/lib/supabase'
import { NftTransfer, Transaction } from '~/types'
import { decodeLogs, fetchLogsForBlockRange, getNftType } from '~/utils'
import { fetchBlockTimestamp } from '~/utils/fetchBlockTimestamp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Kick up the max execution time

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let fromBlockStr = searchParams.get('fromBlock')
  let toBlockStr = searchParams.get('toBlock')

  if (!fromBlockStr || !toBlockStr) {
    if (!fromBlockStr) {
      const lastProcessedBlock = await getMetaValue('last_processed_block')
      fromBlockStr = lastProcessedBlock
        ? lastProcessedBlock
        : process.env.TREASURY_FIRST_TX_WITH_CONTENT_BLOCK || '0'
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
      await setMetaValue('last_processed_block', toBlock.toString())
      return new Response(
        JSON.stringify({ success: true, message: 'No logs found' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const contractAddresses = {
      axs: process.env.AXS_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      weth: process.env.WETH_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      ascend: process.env.AXIE_ASCEND_CONTRACT_ADDRESS.toLowerCase(),
      axie: process.env.AXIE_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      land: process.env.LAND_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      landItem: process.env.LAND_ITEM_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      rune: process.env.RUNE_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      charm: process.env.CHARM_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      evolution: process.env.PART_EVOLUTION_CONTRACT_ADDRESS.toLowerCase(),
    }

    const filteredLogs = logs.filter((log) =>
      log.topics.includes(
        web3.eth.abi.encodeParameter(
          'address',
          process.env.COMMUNITY_TREASURY_ADDRESS.toLowerCase(),
        ),
      ),
    )

    if (filteredLogs.length === 0) {
      await setMetaValue('last_processed_block', toBlock.toString())
      return new Response(
        JSON.stringify({ success: true, message: 'No logs found' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const decodedLogs = {
      axs: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.axs),
        axsTokenAbi,
        web3,
      ),
      weth: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.weth),
        wethTokenAbi,
        web3,
      ),
      ascend: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.ascend),
        axsTokenAbi,
        web3,
      ),
      axie: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.axie),
        axieInfinityAbi,
        web3,
      ),
      land: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.land),
        landTokenAbi,
        web3,
      ),
      landItem: decodeLogs(
        filteredLogs.filter(
          (log) => log.address === contractAddresses.landItem,
        ),
        landItemTokenAbi,
        web3,
      ),
      rune: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.rune),
        runeTokenAbi,
        web3,
      ),
      charm: decodeLogs(
        filteredLogs.filter((log) => log.address === contractAddresses.charm),
        charmTokenAbi,
        web3,
      ),
      evolution: decodeLogs(
        filteredLogs.filter(
          (log) => log.address === contractAddresses.evolution,
        ),
        partEvolutionAbi,
        web3,
      ),
    }

    const combinedLogs = [
      ...decodedLogs.ascend,
      ...decodedLogs.axs,
      ...decodedLogs.weth,
      ...decodedLogs.axie,
      ...decodedLogs.land,
      ...decodedLogs.landItem,
      ...decodedLogs.rune,
      ...decodedLogs.charm,
      ...decodedLogs.evolution,
    ]

    const logsByTransaction: { [key: string]: any[] } = {}
    combinedLogs.forEach((log) => {
      if (!logsByTransaction[log.transactionHash]) {
        logsByTransaction[log.transactionHash] = []
      }
      logsByTransaction[log.transactionHash].push(log)
    })

    for (const [transactionHash, logs] of Object.entries(logsByTransaction)) {
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

      let axsFee = '0'
      let wethFee = '0'
      let transactionSource = 'unknown'
      let hasTreasuryTransfer = false
      const nftTransfers: NftTransfer[] = []

      logs.forEach((log) => {
        const { event, decodedLog, contractAddress } = log
        const fromAddress = (decodedLog._from || decodedLog.from)?.toLowerCase()
        const toAddress = (decodedLog._to || decodedLog.to)?.toLowerCase()

        if (fromAddress === process.env.MARKETPLACE_CONTRACT_ADDRESS) {
          transactionSource = 'marketplace'
        } else if (fromAddress === process.env.PORTAL_CONTRACT_ADDRESS) {
          transactionSource = 'portal'
        } else if (fromAddress === process.env.AXIE_ASCEND_CONTRACT_ADDRESS) {
          transactionSource = 'ascend'
        } else if (event === 'PartEvolutionCreated') {
          transactionSource = 'evolution'
        } else if (event === 'AxieSpawn') {
          transactionSource = 'breeding'
        }

        if (contractAddress === process.env.AXS_TOKEN_CONTRACT_ADDRESS) {
          axsFee = decodedLog._value as string
          hasTreasuryTransfer = true
        } else if (
          contractAddress === process.env.WETH_TOKEN_CONTRACT_ADDRESS &&
          toAddress === process.env.COMMUNITY_TREASURY_ADDRESS
        ) {
          wethFee = decodedLog._value as string
          hasTreasuryTransfer = true
        }

        if (
          (event === 'Transfer' || event === 'TransferSingle') &&
          toAddress &&
          fromAddress
        ) {
          const tokenId = decodedLog._tokenId || decodedLog.id
          if (tokenId) {
            nftTransfers.push({
              transaction_id: transactionHash,
              id: tokenId.toString(),
              type: getNftType(contractAddress),
            })
          }
        }
      })

      if (!hasTreasuryTransfer) {
        continue
      }

      let transactionType = 'unknown'
      if (transactionSource === 'marketplace') {
        transactionType = 'sale'
      } else if (transactionSource === 'portal') {
        transactionType = 'rc-mint'
      } else if (transactionSource === 'ascend') {
        transactionType = 'ascension'
      } else if (transactionSource === 'breeding') {
        transactionType = 'breeding'
      } else if (transactionSource === 'evolution') {
        transactionType = 'evolution'
      }

      if (transactionSource === 'unknown' && nftTransfers.length > 0) {
        transactionType = 'sale'
      }

      const newTransaction: Transaction = {
        transaction_id: transactionHash,
        timestamp: new Date(parseInt(blockTimestamp, 16) * 1000).toISOString(),
        block: parseInt(transaction.blockNumber, 16),
        type: transactionType,
        axs_fee: axsFee,
        weth_fee: wethFee,
        gas_used: parseInt(transaction.gasUsed, 16),
        gas_price: parseFloat(
          web3.utils.fromWei(transaction.effectiveGasPrice, 'gwei'),
        ),
      }

      console.log('newTransaction', newTransaction)

      await upsertTransaction(newTransaction, nftTransfers)
    }

    await setMetaValue('last_processed_block', toBlock.toString())

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
