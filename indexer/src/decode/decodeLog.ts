import type { ContractKey, NftKind } from '@axie-gov/shared'
import type { Address, Hex } from 'viem'
import { decodeEventLog } from 'viem'

import type { Logger } from '../logger.js'
import type { RawLog } from '../rpc/methods.js'
import type { BridgeEvent, MarkerEvent } from './registry.js'
import { lookupContract } from './registry.js'

interface LogBase {
  address: Address
  contract: ContractKey
  logIndex: number
  txHash: Hex
  blockNumber: number
}

export interface Erc20TransferLog extends LogBase {
  kind: 'erc20Transfer'
  token: 'AXS' | 'WETH'
  from: Address
  to: Address
  value: bigint
}

export interface Erc721TransferLog extends LogBase {
  kind: 'erc721Transfer'
  nftType: NftKind
  from: Address
  to: Address
  tokenId: bigint
}

export interface Erc1155SingleLog extends LogBase {
  kind: 'erc1155Single'
  nftType: NftKind
  operator: Address
  from: Address
  to: Address
  id: bigint
  value: bigint
}

export interface Erc1155BatchLog extends LogBase {
  kind: 'erc1155Batch'
  nftType: NftKind
  operator: Address
  from: Address
  to: Address
  ids: bigint[]
  values: bigint[]
}

export interface MarkerLog extends LogBase {
  kind: 'marker'
  event: MarkerEvent
  args: Record<string, unknown>
}

export interface BridgeLog extends LogBase {
  kind: 'bridge'
  event: BridgeEvent
  receiptId: bigint
  /** Transfer.Kind: 0 = Deposit, 1 = Withdrawal */
  receiptKind: number
  roninAddr: Address
  roninTokenAddr: Address
  mainchainAddr: Address
  mainchainTokenAddr: Address
  /** Token.Standard: 0 = ERC20, 1 = ERC721 */
  erc: number
  tokenId: bigint
  quantity: bigint
}

export type DecodedLog =
  | Erc20TransferLog
  | Erc721TransferLog
  | Erc1155SingleLog
  | Erc1155BatchLog
  | MarkerLog
  | BridgeLog

const lower = (a: unknown): Address => String(a).toLowerCase() as Address

type Args = Record<string, unknown>

interface GatewayReceipt {
  id: bigint
  kind: number
  mainchain: { addr: string; tokenAddr: string; chainId: bigint }
  ronin: { addr: string; tokenAddr: string; chainId: bigint }
  info: { erc: number; id: bigint; quantity: bigint }
}

/**
 * Decode one raw log into the normalized union. Returns undefined for logs
 * from contracts we do not track and for events we do not care about
 * (Approval, role changes, ...). Logs that *should* decode but fail are
 * reported through `log` and skipped, never thrown.
 */
export function decodeLog(raw: RawLog, log?: Logger): DecodedLog | undefined {
  const reg = lookupContract(raw.address)
  if (!reg) return undefined
  const topic0 = raw.topics[0]
  if (!topic0) return undefined
  const ev = reg.events.get(topic0)
  if (!ev) return undefined
  const base: LogBase = {
    address: raw.address,
    contract: reg.descriptor.key,
    logIndex: raw.logIndex,
    txHash: raw.transactionHash,
    blockNumber: raw.blockNumber,
  }
  let args: Args
  try {
    const decoded = decodeEventLog({
      abi: [ev.abi],
      data: raw.data,
      topics: raw.topics as [Hex, ...Hex[]],
      strict: true,
    })
    args = decoded.args as unknown as Args
  } catch (err) {
    log?.warn(
      {
        tx: raw.transactionHash,
        logIndex: raw.logIndex,
        contract: reg.descriptor.key,
        event: ev.name,
        err: (err as Error).message,
      },
      'undecodable log skipped',
    )
    return undefined
  }
  const nftType = reg.descriptor.nftType
  switch (ev.kind) {
    case 'erc20Transfer':
      return {
        ...base,
        kind: 'erc20Transfer',
        token: reg.descriptor.key as 'AXS' | 'WETH',
        from: lower(args.from),
        to: lower(args.to),
        value: args.value as bigint,
      }
    case 'erc721Transfer':
      if (!nftType) return undefined
      return {
        ...base,
        kind: 'erc721Transfer',
        nftType,
        from: lower(args.from),
        to: lower(args.to),
        tokenId: args.tokenId as bigint,
      }
    case 'erc1155Single':
      if (!nftType) return undefined
      return {
        ...base,
        kind: 'erc1155Single',
        nftType,
        operator: lower(args.operator),
        from: lower(args.from),
        to: lower(args.to),
        id: args.id as bigint,
        value: args.value as bigint,
      }
    case 'erc1155Batch':
      if (!nftType) return undefined
      return {
        ...base,
        kind: 'erc1155Batch',
        nftType,
        operator: lower(args.operator),
        from: lower(args.from),
        to: lower(args.to),
        ids: [...(args.ids as readonly bigint[])],
        values: [...(args.values as readonly bigint[])],
      }
    case 'marker':
      return { ...base, kind: 'marker', event: ev.name as MarkerEvent, args }
    case 'bridge': {
      const receipt = args.receipt as GatewayReceipt | undefined
      if (!receipt) {
        log?.warn(
          { tx: raw.transactionHash, logIndex: raw.logIndex },
          'gateway event without receipt struct',
        )
        return undefined
      }
      return {
        ...base,
        kind: 'bridge',
        event: ev.name as BridgeEvent,
        receiptId: receipt.id,
        receiptKind: Number(receipt.kind),
        roninAddr: lower(receipt.ronin.addr),
        roninTokenAddr: lower(receipt.ronin.tokenAddr),
        mainchainAddr: lower(receipt.mainchain.addr),
        mainchainTokenAddr: lower(receipt.mainchain.tokenAddr),
        erc: Number(receipt.info.erc),
        tokenId: receipt.info.id,
        quantity: receipt.info.quantity,
      }
    }
  }
}

export function decodeLogs(
  raws: readonly RawLog[],
  log?: Logger,
): DecodedLog[] {
  const out: DecodedLog[] = []
  for (const raw of raws) {
    const d = decodeLog(raw, log)
    if (d) out.push(d)
  }
  return out
}
