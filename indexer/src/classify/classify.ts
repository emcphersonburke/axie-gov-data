import type { NftKind, NftType, TxType } from '@axie-gov/shared'
import { ADDRESSES } from '@axie-gov/shared'
import type { Address, Hex } from 'viem'

import type { DecodedLog } from '../decode/decodeLog.js'

export type Token = 'AXS' | 'WETH'
export type Direction = 'in' | 'out'

export interface TokenTransferRow {
  logIndex: number
  token: Token
  direction: Direction
  from: Address
  to: Address
  amountWei: bigint
}

export interface NftTransferRow {
  logIndex: number
  subIndex: number
  contract: Address
  nftType: NftKind
  tokenId: bigint
  quantity: bigint
  from: Address
  to: Address
}

export interface ClassifiedTx {
  hash: Hex
  block: number
  txIndex: number | null
  from: Address | null
  to: Address | null
  type: TxType
  nftType: NftType
  /** number of NFT transfer rows (after TransferBatch expansion) */
  nftCount: number
  axsInWei: bigint
  wethInWei: bigint
  axsOutWei: bigint
  wethOutWei: bigint
  tokenTransfers: TokenTransferRow[]
  nftTransfers: NftTransferRow[]
  /** distinct `from` addresses of the inflow transfers, for diagnostics */
  feeFroms: Address[]
  markers: string[]
}

export interface TxInput {
  hash: Hex
  block: number
  txIndex: number | null
  from: Address | null
  to: Address | null
  logs: readonly DecodedLog[]
}

export interface ClassifyOptions {
  treasury?: Address
  marketplace?: Address
  portal?: Address
}

/**
 * Pure classification of one transaction from its decoded logs.
 *
 * Precedence (tests pin it): PrayerCountSynced → atiablessing,
 * AxieLevelAscended → ascension, PartEvolutionCreated → evolution,
 * AxieSpawn → breeding, fee paid by the marketplace → sale, fee paid by the
 * portal → rc-mint, inflow with NFT movement → sale, inflow → unknown,
 * otherwise → outflow.
 */
export function classifyTx(
  tx: TxInput,
  opts: ClassifyOptions = {},
): ClassifiedTx {
  const treasury = opts.treasury ?? ADDRESSES.TREASURY
  const marketplace = opts.marketplace ?? ADDRESSES.MARKETPLACE
  const portal = opts.portal ?? ADDRESSES.PORTAL

  const tokenTransfers: TokenTransferRow[] = []
  const nftTransfers: NftTransferRow[] = []
  const markers = new Set<string>()
  const feeFroms = new Set<Address>()
  const kinds = new Set<NftKind>()
  let axsInWei = 0n
  let wethInWei = 0n
  let axsOutWei = 0n
  let wethOutWei = 0n

  for (const log of tx.logs) {
    switch (log.kind) {
      case 'erc20Transfer': {
        const toTreasury = log.to === treasury
        const fromTreasury = log.from === treasury
        if (toTreasury === fromTreasury) break // not treasury-touching, or a self-transfer (net zero)
        const direction: Direction = toTreasury ? 'in' : 'out'
        tokenTransfers.push({
          logIndex: log.logIndex,
          token: log.token,
          direction,
          from: log.from,
          to: log.to,
          amountWei: log.value,
        })
        if (direction === 'in') {
          feeFroms.add(log.from)
          if (log.token === 'AXS') axsInWei += log.value
          else wethInWei += log.value
        } else if (log.token === 'AXS') axsOutWei += log.value
        else wethOutWei += log.value
        break
      }
      case 'erc721Transfer':
        kinds.add(log.nftType)
        nftTransfers.push({
          logIndex: log.logIndex,
          subIndex: 0,
          contract: log.address,
          nftType: log.nftType,
          tokenId: log.tokenId,
          quantity: 1n,
          from: log.from,
          to: log.to,
        })
        break
      case 'erc1155Single':
        kinds.add(log.nftType)
        nftTransfers.push({
          logIndex: log.logIndex,
          subIndex: 0,
          contract: log.address,
          nftType: log.nftType,
          tokenId: log.id,
          quantity: log.value,
          from: log.from,
          to: log.to,
        })
        break
      case 'erc1155Batch':
        kinds.add(log.nftType)
        log.ids.forEach((id, i) => {
          nftTransfers.push({
            logIndex: log.logIndex,
            subIndex: i,
            contract: log.address,
            nftType: log.nftType,
            tokenId: id,
            quantity: log.values[i] ?? 0n,
            from: log.from,
            to: log.to,
          })
        })
        break
      case 'marker':
        markers.add(log.event)
        break
      case 'bridge':
        break
    }
  }

  const hasInflow =
    axsInWei > 0n ||
    wethInWei > 0n ||
    tokenTransfers.some((t) => t.direction === 'in')
  let type: TxType
  if (markers.has('PrayerCountSynced')) type = 'atiablessing'
  else if (markers.has('AxieLevelAscended')) type = 'ascension'
  else if (markers.has('PartEvolutionCreated')) type = 'evolution'
  else if (markers.has('AxieSpawn')) type = 'breeding'
  else if (feeFroms.has(marketplace)) type = 'sale'
  else if (feeFroms.has(portal)) type = 'rc-mint'
  else if (hasInflow && nftTransfers.length > 0) type = 'sale'
  else if (hasInflow) type = 'unknown'
  else type = 'outflow'

  let nftType: NftType
  if (kinds.size === 0) nftType = 'None'
  else if (kinds.size === 1) nftType = [...kinds][0] as NftKind
  else nftType = 'Mixed'

  return {
    hash: tx.hash,
    block: tx.block,
    txIndex: tx.txIndex,
    from: tx.from,
    to: tx.to,
    type,
    nftType,
    nftCount: nftTransfers.length,
    axsInWei,
    wethInWei,
    axsOutWei,
    wethOutWei,
    tokenTransfers,
    nftTransfers,
    feeFroms: [...feeFroms],
    markers: [...markers],
  }
}

/** 18-decimal wei → token units as a JS number (for REAL columns and JSON). Exact values stay as strings. */
export function weiToUnits(wei: bigint, decimals = 18): number {
  const neg = wei < 0n
  const abs = neg ? -wei : wei
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base
  const n = Number(whole) + Number(frac) / Number(base)
  return neg ? -n : n
}
