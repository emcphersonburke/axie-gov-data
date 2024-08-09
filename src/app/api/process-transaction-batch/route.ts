import { NextRequest } from 'next/server'
import Web3 from 'web3'

import {
  atiasBlessingAbi,
  axieAccessoryTokenAbi,
  axieAscendAbi,
  axieInfinityAbi,
  axsTokenAbi,
  charmTokenAbi,
  consumableTokenAbi,
  landItemTokenAbi,
  landTokenAbi,
  materialAbi,
  partEvolutionAbi,
  runeTokenAbi,
  wethTokenAbi,
} from '~/lib/abis/'
import { getMetaValue, setMetaValue, upsertTransaction } from '~/lib/supabase'
import { NftTransfer, Transaction } from '~/types'
import {
  decodeLogs,
  fetchBlockTimestamp,
  fetchLogsForBlockRange,
  getNftType,
} from '~/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Kick up the max execution time

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)
const blockTimestampCache: Record<string, string> = {}

const fetchCachedBlockTimestamp = async (blockNumber: string) => {
  if (blockTimestampCache[blockNumber]) {
    return blockTimestampCache[blockNumber]
  }

  const timestamp = await fetchBlockTimestamp(blockNumber)
  blockTimestampCache[blockNumber] = timestamp
  return timestamp
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let fromBlockStr = searchParams.get('fromBlock')
  let toBlockStr = searchParams.get('toBlock')

  if (!fromBlockStr || !toBlockStr) {
    // Fetch the last processed block from the meta table if fromBlock is not provided
    if (!fromBlockStr) {
      const lastProcessedBlock = await getMetaValue('last_processed_block')

      // Return early if we don't have a last processed block
      if (!lastProcessedBlock) {
        return new Response(
          JSON.stringify({ error: 'No last processed block found' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      fromBlockStr = lastProcessedBlock

      // Uncomment the below if starting with an empty database
      // fromBlockStr = lastProcessedBlock
      //   ? lastProcessedBlock
      //   : process.env.TREASURY_FIRST_TX_WITH_CONTENT_BLOCK || '0'
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
    // Fetch logs for the specified block range
    const logs = await fetchLogsForBlockRange(fromBlock, toBlock)

    // Return early if no logs are found in the block range
    if (logs.length === 0) {
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

    // Define contract addresses for easy reference
    const contractAddresses = {
      atia: process.env.ATIAS_BLESSING_CONTRACT_ADDRESS.toLowerCase(),
      accessory:
        process.env.AXIE_ACCESSORY_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      axs: process.env.AXS_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      weth: process.env.WETH_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      ascend: process.env.AXIE_ASCEND_CONTRACT_ADDRESS.toLowerCase(),
      axie: process.env.AXIE_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      land: process.env.LAND_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      landItem: process.env.LAND_ITEM_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      material: process.env.MATERIAL_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      rune: process.env.RUNE_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      charm: process.env.CHARM_TOKEN_CONTRACT_ADDRESS.toLowerCase(),
      evolution: process.env.PART_EVOLUTION_CONTRACT_ADDRESS.toLowerCase(),
      consumable: process.env.CONSUMABLE_ITEM_TOKEN_ADDRESS.toLowerCase(),
    }

    // Decode logs for each contract
    const decodedLogs = {
      accessory: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.accessory),
        axieAccessoryTokenAbi,
        web3,
      ),
      atia: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.atia),
        atiasBlessingAbi,
        web3,
      ),
      axs: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.axs),
        axsTokenAbi,
        web3,
      ),
      weth: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.weth),
        wethTokenAbi,
        web3,
      ),
      ascend: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.ascend),
        axieAscendAbi,
        web3,
      ),
      axie: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.axie),
        axieInfinityAbi,
        web3,
      ),
      land: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.land),
        landTokenAbi,
        web3,
      ),
      landItem: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.landItem),
        landItemTokenAbi,
        web3,
      ),
      material: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.material),
        materialAbi,
        web3,
      ),
      rune: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.rune),
        runeTokenAbi,
        web3,
      ),
      charm: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.charm),
        charmTokenAbi,
        web3,
      ),
      evolution: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.evolution),
        partEvolutionAbi,
        web3,
      ),
      consumable: decodeLogs(
        logs.filter((log) => log.address === contractAddresses.consumable),
        consumableTokenAbi,
        web3,
      ),
    }

    // Combine all decoded logs into a single array
    const combinedLogs = [
      ...decodedLogs.accessory,
      ...decodedLogs.atia,
      ...decodedLogs.ascend,
      ...decodedLogs.axs,
      ...decodedLogs.weth,
      ...decodedLogs.axie,
      ...decodedLogs.land,
      ...decodedLogs.landItem,
      ...decodedLogs.material,
      ...decodedLogs.rune,
      ...decodedLogs.charm,
      ...decodedLogs.evolution,
      ...decodedLogs.consumable,
    ]

    // Group logs by transaction hash
    const logsByTransaction: { [key: string]: any[] } = {}
    combinedLogs.forEach((log) => {
      if (!logsByTransaction[log.transactionHash]) {
        logsByTransaction[log.transactionHash] = []
      }
      logsByTransaction[log.transactionHash].push(log)
    })

    // Filter transactions that include at least one treasury transfer
    const filteredTransactions = Object.entries(logsByTransaction).filter(
      ([, logs]) =>
        logs.some(
          (log) =>
            (log.contractAddress === process.env.AXS_TOKEN_CONTRACT_ADDRESS ||
              log.contractAddress ===
                process.env.WETH_TOKEN_CONTRACT_ADDRESS) &&
            log.decodedLog._to?.toLowerCase() ===
              process.env.COMMUNITY_TREASURY_ADDRESS.toLowerCase(),
        ),
    )

    // Extract unique block numbers
    const uniqueBlockNumbers = [
      ...new Set(
        filteredTransactions.flatMap(([, logs]) =>
          logs.map((log) => log.blockNumber),
        ),
      ),
    ]

    // Fetch all block timestamps concurrently
    const blockTimestamps = await Promise.all(
      uniqueBlockNumbers.map((blockNumber) =>
        fetchCachedBlockTimestamp(blockNumber),
      ),
    )

    // Create a map of block numbers to timestamps
    const blockTimestampMap = uniqueBlockNumbers.reduce(
      (acc, blockNumber, index) => {
        acc[blockNumber] = blockTimestamps[index]
        return acc
      },
      {} as Record<string, string>,
    )

    // Process each filtered transaction
    for (const [transactionHash, logs] of filteredTransactions) {
      const blockNumber = logs[0].blockNumber
      const blockTimestamp = blockTimestampMap[blockNumber]

      // Aggregate information from logs
      let axsFee = '0'
      let wethFee = '0'
      let transactionSource = 'unknown'
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
        } else if (event === 'PrayerCountSynced') {
          transactionSource = 'atiablessing'
        } else if (event === 'AxieLevelAscended') {
          transactionSource = 'ascend'
        } else if (event === 'PartEvolutionCreated') {
          transactionSource = 'evolution'
        } else if (event === 'AxieSpawn') {
          transactionSource = 'breeding'
        }

        // Determine if this transaction contains AXS or WETH fees to the treasury
        if (toAddress === process.env.COMMUNITY_TREASURY_ADDRESS) {
          if (contractAddress === process.env.AXS_TOKEN_CONTRACT_ADDRESS) {
            axsFee = decodedLog._value.toString()
          } else if (
            contractAddress === process.env.WETH_TOKEN_CONTRACT_ADDRESS
          ) {
            wethFee = decodedLog._value.toString()
          }
        }

        // Determine if this transaction involves an NFT transfer
        if (
          (event === 'Transfer' || event === 'TransferSingle') &&
          toAddress &&
          fromAddress
        ) {
          const tokenId =
            decodedLog._tokenId || decodedLog.tokenId || decodedLog.id
          if (tokenId) {
            nftTransfers.push({
              transaction_id: transactionHash,
              id: tokenId.toString(),
              type: getNftType(contractAddress),
            })
          }
        }
      })

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
      } else if (transactionSource === 'atiablessing') {
        transactionType = 'atiablessing'
      }

      // In older transactions, the fee would originate from the user address instead of
      // the marketplace contract. This is a workaround to label these transactions correctly.
      if (transactionSource === 'unknown' && nftTransfers.length > 0) {
        transactionType = 'sale'
      }

      const newTransaction: Transaction = {
        transaction_id: transactionHash,
        timestamp: new Date(parseInt(blockTimestamp, 16) * 1000).toISOString(),
        block: parseInt(blockNumber, 16),
        type: transactionType,
        axs_fee: axsFee,
        weth_fee: wethFee,
      }

      // console.log('newTransaction', newTransaction)

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
