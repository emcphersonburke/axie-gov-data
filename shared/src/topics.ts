import type { Abi, AbiEvent, Hex } from 'viem'
import { toEventSelector } from 'viem'

import { erc20EventsAbi, erc1155EventsAbi } from './abis/canonical.js'

/** Look up an event in an ABI by name; throws if missing or ambiguous (event names are unique per contract here). */
export function abiEvent<const TAbi extends Abi>(
  abi: TAbi,
  name: string,
): AbiEvent {
  const items = abi.filter(
    (i): i is AbiEvent => i.type === 'event' && i.name === name,
  )
  const item = items[0]
  if (!item) throw new Error(`event ${name} not found in ABI`)
  return item
}

/** topic0 for a named event in an ABI. */
export function eventSelector<const TAbi extends Abi>(
  abi: TAbi,
  name: string,
): Hex {
  return toEventSelector(abiEvent(abi, name))
}

/** ERC-20 and ERC-721 `Transfer(address,address,uint256)` share this topic0. */
export const TRANSFER_TOPIC: Hex = eventSelector(erc20EventsAbi, 'Transfer')
export const TRANSFER_SINGLE_TOPIC: Hex = eventSelector(
  erc1155EventsAbi,
  'TransferSingle',
)
export const TRANSFER_BATCH_TOPIC: Hex = eventSelector(
  erc1155EventsAbi,
  'TransferBatch',
)
