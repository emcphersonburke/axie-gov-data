import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'
import { AbiItem } from 'web3-utils'

import {
  axieInfinityAbi,
  axsTokenAbi,
  charmTokenAbi,
  landTokenAbi,
  runeTokenAbi,
  wethTokenAbi,
} from '~/lib/abi'
import { getMetaValue, setMetaValue, upsertTransaction } from '~/lib/supabase'
import { Transaction } from '~/types'
import { decodeLogs, fetchLogsForContract, getNftType } from '~/utils'
import { fetchBlockTimestamp } from '~/utils/fetchBlockTimestamp'

export const dynamic = 'force-dynamic'

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let fromBlockStr = searchParams.get('fromBlock')
  let toBlockStr = searchParams.get('toBlock')

  if (!fromBlockStr || !toBlockStr) {
    // Fetch the last processed block from the meta table if fromBlock is not provided
    if (!fromBlockStr) {
      const lastProcessedBlock = await getMetaValue('last_processed_block')
      fromBlockStr = lastProcessedBlock
        ? lastProcessedBlock
        : process.env.TREASURY_FIRST_TX_WITH_CONTENT_BLOCK || '0'
    }

    // Calculate toBlock based on fromBlock if toBlock is not provided
    if (!toBlockStr) {
      const blockInterval = 50
      toBlockStr = (parseInt(fromBlockStr, 10) + blockInterval).toString()
    }
  }

  const fromBlock = parseInt(fromBlockStr, 10)
  const toBlock = parseInt(toBlockStr, 10)

  try {
    const axsTransferTopic = web3.eth.abi.encodeEventSignature({
      name: 'Transfer',
      type: 'event',
      inputs: [
        { type: 'address', name: 'from', indexed: true },
        { type: 'address', name: 'to', indexed: true },
        { type: 'uint256', name: 'value', indexed: false },
      ],
    })

    const communityTreasuryAddress =
      process.env.COMMUNITY_TREASURY_ADDRESS.toLowerCase()
    const communityTreasuryTopic = web3.eth.abi.encodeParameter(
      'address',
      communityTreasuryAddress,
    )

    // Fetch any relevant logs for AXS, WETH transfers to the treasury concurrently
    const [axsLogs, wethLogs] = await Promise.all([
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.AXS_TOKEN_CONTRACT_ADDRESS,
        [axsTransferTopic, null, communityTreasuryTopic],
      ),
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.WETH_TOKEN_CONTRACT_ADDRESS,
        [axsTransferTopic, null, communityTreasuryTopic],
      ),
    ])

    // Return early if no AXS or WETH logs are found in the block range
    if (axsLogs.length === 0 && wethLogs.length === 0) {
      // Update the last processed block in the meta table
      await setMetaValue('last_processed_block', toBlock.toString())

      return new Response(
        JSON.stringify({ success: true, message: 'No logs found' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Fetch logs for other NFT contracts concurrently
    const [axieLogs, landLogs, runeLogs, charmLogs] = await Promise.all([
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.AXIE_TOKEN_CONTRACT_ADDRESS,
        [],
      ),
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.LAND_TOKEN_CONTRACT_ADDRESS,
        [],
      ),
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.RUNE_TOKEN_CONTRACT_ADDRESS,
        [],
      ),
      fetchLogsForContract(
        fromBlock,
        toBlock,
        process.env.CHARM_TOKEN_CONTRACT_ADDRESS,
        [],
      ),
    ])

    const decodedAxsLogs = decodeLogs(axsLogs, axsTokenAbi, web3)
    const decodedWethLogs = decodeLogs(wethLogs, wethTokenAbi, web3)
    const decodedAxieLogs = decodeLogs(axieLogs, axieInfinityAbi, web3)
    const decodedLandLogs = decodeLogs(landLogs, landTokenAbi, web3)
    const decodedRuneLogs = decodeLogs(runeLogs, runeTokenAbi, web3)
    const decodedCharmLogs = decodeLogs(charmLogs, charmTokenAbi, web3)

    const combinedLogs = [
      ...decodedAxsLogs,
      ...decodedWethLogs,
      ...decodedAxieLogs,
      ...decodedLandLogs,
      ...decodedRuneLogs,
      ...decodedCharmLogs,
    ]

    // Group logs by transactionHash
    const logsByTransaction: { [key: string]: any[] } = {}
    combinedLogs.forEach((log) => {
      if (!logsByTransaction[log.transactionHash]) {
        logsByTransaction[log.transactionHash] = []
      }
      logsByTransaction[log.transactionHash].push(log)
    })

    // Process each transaction
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

      // Aggregate information from logs
      let axsFee = 0
      let wethFee = 0
      let nftId: string | null = null
      let nftType: string | null = null
      let transactionSource = 'unknown'
      let hasTreasuryTransfer = false

      logs.forEach((log) => {
        const { event, decodedLog, contractAddress } = log
        const fromAddress = (decodedLog._from || decodedLog.from)?.toLowerCase()
        const toAddress = (decodedLog._to || decodedLog.to)?.toLowerCase()

        // Determine if this transaction originated from the marketplace contract
        if (fromAddress === process.env.MARKETPLACE_CONTRACT_ADDRESS) {
          transactionSource = 'marketplace'
        }

        // Determine if this transaction contains AXS or WETH fees to the treasury
        if (contractAddress === process.env.AXS_TOKEN_CONTRACT_ADDRESS) {
          axsFee = parseFloat(decodedLog._value as string)
          hasTreasuryTransfer = true
        } else if (
          contractAddress === process.env.WETH_TOKEN_CONTRACT_ADDRESS &&
          toAddress === process.env.COMMUNITY_TREASURY_ADDRESS
        ) {
          wethFee = parseFloat(decodedLog._value as string)
          hasTreasuryTransfer = true
        }

        // Determine if this transaction involves an NFT transfer
        if (
          (event === 'Transfer' || event === 'TransferSingle') &&
          toAddress &&
          fromAddress
        ) {
          const tokenId = decodedLog._tokenId || decodedLog.id
          if (tokenId) {
            nftId = tokenId.toString()
            nftType = getNftType(contractAddress)

            // In older transactions, the fee would originate from the user address instead of
            // the marketplace contract. This is a workaround to label these transactions correctly.
            if (transactionSource === 'unknown') {
              transactionSource = 'marketplace'
            }
          }
        }
      })

      // Ignore transactions that do not contain any AXS or WETH going to the treasury
      if (!hasTreasuryTransfer) {
        continue
      }

      const newTransaction: Transaction = {
        transaction_id: transactionHash,
        timestamp: new Date(parseInt(blockTimestamp, 16) * 1000).toISOString(),
        block: parseInt(transaction.blockNumber, 16),
        source: transactionSource,
        axs_fee: axsFee,
        weth_fee: wethFee,
        gas_used: parseInt(transaction.gasUsed, 16),
        gas_price: parseInt(transaction.effectiveGasPrice, 16) / 1e9, // Convert Wei to Gwei
        nft_id: nftId,
        nft_type: nftType,
      }

      await upsertTransaction(newTransaction)
    }

    // Update the last processed block in the meta table
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
