import axios from 'axios'
import { NextRequest } from 'next/server'
import Web3 from 'web3'

import {
  axieInfinityAbi,
  axsTokenAbi,
  charmTokenAbi,
  landTokenAbi,
  partEvolutionAbi,
  runeTokenAbi,
  wethTokenAbi,
} from '~/lib/abi'
import { getMetaValue, setMetaValue, upsertTransaction } from '~/lib/supabase'
import { NftTransfer, Transaction } from '~/types'
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
      const blockInterval = 20
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
    const [ascendLogs, axieLogs, landLogs, runeLogs, charmLogs, evolutionLogs] =
      await Promise.all([
        fetchLogsForContract(
          fromBlock,
          toBlock,
          process.env.AXIE_ASCEND_CONTRACT_ADDRESS,
          [],
        ),
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
        fetchLogsForContract(
          fromBlock,
          toBlock,
          process.env.PART_EVOLUTION_CONTRACT_ADDRESS,
          [],
        ),
      ])

    // Decode logs for each contract
    const decodedAscendLogs = decodeLogs(ascendLogs, axsTokenAbi, web3)
    const decodedAxsLogs = decodeLogs(axsLogs, axsTokenAbi, web3)
    const decodedWethLogs = decodeLogs(wethLogs, wethTokenAbi, web3)
    const decodedAxieLogs = decodeLogs(axieLogs, axieInfinityAbi, web3)
    const decodedLandLogs = decodeLogs(landLogs, landTokenAbi, web3)
    const decodedRuneLogs = decodeLogs(runeLogs, runeTokenAbi, web3)
    const decodedCharmLogs = decodeLogs(charmLogs, charmTokenAbi, web3)
    const decodedEvolutionLogs = decodeLogs(
      evolutionLogs,
      partEvolutionAbi,
      web3,
    )

    const combinedLogs = [
      ...decodedAscendLogs,
      ...decodedAxsLogs,
      ...decodedWethLogs,
      ...decodedAxieLogs,
      ...decodedLandLogs,
      ...decodedRuneLogs,
      ...decodedCharmLogs,
      ...decodedEvolutionLogs,
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
      let axsFee = '0'
      let wethFee = '0'
      let transactionSource = 'unknown'
      let hasTreasuryTransfer = false
      const nftTransfers: NftTransfer[] = []

      logs.forEach((log) => {
        const { event, decodedLog, contractAddress } = log
        const fromAddress = (decodedLog._from || decodedLog.from)?.toLowerCase()
        const toAddress = (decodedLog._to || decodedLog.to)?.toLowerCase()

        // Determine the transaction source
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

        // Determine if this transaction contains AXS or WETH fees to the treasury
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

        // Determine if this transaction involves an NFT transfer
        if (
          (event === 'Transfer' || event === 'TransferSingle') &&
          toAddress &&
          fromAddress
        ) {
          const tokenId = decodedLog._tokenId || decodedLog.id
          if (tokenId) {
            nftTransfers.push({
              transaction_id: transactionHash,
              id: Number(tokenId),
              type: getNftType(contractAddress),
            })
          }
        }
      })

      // Ignore transactions that do not contain any AXS or WETH going to the treasury
      if (!hasTreasuryTransfer) {
        continue
      }

      // Determine transaction type based on source
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

      // In older transactions, the fee would originate from the user address instead of
      // the marketplace contract. This is a workaround to label these transactions correctly.
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

      await upsertTransaction(newTransaction, nftTransfers)
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
