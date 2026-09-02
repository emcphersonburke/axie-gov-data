import type { ContractDescriptor, ContractKey } from '@axie-gov/shared'
import {
  abiEvent,
  atiasBlessingAbi,
  axieAscendAbi,
  axieInfinityAbi,
  CONTRACTS,
  erc20EventsAbi,
  erc721EventsAbi,
  erc1155EventsAbi,
  partEvolutionAbi,
  roninGatewayAbi,
} from '@axie-gov/shared'
import type { Abi, AbiEvent, Address, Hex } from 'viem'
import { toEventSelector } from 'viem'

export type EventKind =
  | 'erc20Transfer'
  | 'erc721Transfer'
  | 'erc1155Single'
  | 'erc1155Batch'
  | 'marker'
  | 'bridge'

export interface EventEntry {
  kind: EventKind
  name: string
  abi: AbiEvent
  topic0: Hex
}

export interface RegistryEntry {
  descriptor: ContractDescriptor
  /** topic0 -> event */
  events: ReadonlyMap<Hex, EventEntry>
}

export const MARKER_EVENTS = [
  'AxieSpawn',
  'AxieLevelAscended',
  'PrayerCountSynced',
  'PartEvolutionCreated',
] as const
export type MarkerEvent = (typeof MARKER_EVENTS)[number]

export const BRIDGE_EVENTS = ['Deposited', 'WithdrawalRequested'] as const
export type BridgeEvent = (typeof BRIDGE_EVENTS)[number]

/** Which project ABI carries each contract's marker events. */
const PROJECT_ABIS: Partial<Record<ContractKey, Abi>> = {
  AXIE: axieInfinityAbi,
  AXIE_ASCEND: axieAscendAbi,
  ATIAS_BLESSING: atiasBlessingAbi,
  PART_EVOLUTION: partEvolutionAbi,
  RONIN_GATEWAY: roninGatewayAbi,
}

/**
 * Give unnamed event inputs stable names so viem decodes them as an object.
 * `WithdrawalRequested(bytes32 receiptHash, Transfer.Receipt)` leaves the
 * struct unnamed in the gateway ABI; we call it `receipt` like `Deposited`.
 */
function withNamedInputs(
  event: AbiEvent,
  fallbackNames: readonly string[],
): AbiEvent {
  let changed = false
  const inputs = event.inputs.map((input, i) => {
    if (input.name) return input
    changed = true
    return { ...input, name: fallbackNames[i] ?? `arg${i}` }
  })
  return changed ? { ...event, inputs } : event
}

function entry(kind: EventKind, abi: AbiEvent): [Hex, EventEntry] {
  const topic0 = toEventSelector(abi)
  return [topic0, { kind, name: abi.name, abi, topic0 }]
}

function buildRegistry(): Map<Address, RegistryEntry> {
  const out = new Map<Address, RegistryEntry>()
  for (const descriptor of CONTRACTS) {
    const events = new Map<Hex, EventEntry>()
    switch (descriptor.standard) {
      case 'erc20':
        events.set(
          ...entry('erc20Transfer', abiEvent(erc20EventsAbi, 'Transfer')),
        )
        break
      case 'erc721':
        events.set(
          ...entry('erc721Transfer', abiEvent(erc721EventsAbi, 'Transfer')),
        )
        break
      case 'erc1155':
        events.set(
          ...entry(
            'erc1155Single',
            abiEvent(erc1155EventsAbi, 'TransferSingle'),
          ),
        )
        events.set(
          ...entry('erc1155Batch', abiEvent(erc1155EventsAbi, 'TransferBatch')),
        )
        break
      case 'system':
        break
    }
    const projectAbi = PROJECT_ABIS[descriptor.key]
    for (const name of descriptor.markerEvents ?? []) {
      if (!projectAbi)
        throw new Error(
          `no project ABI registered for ${descriptor.key} (${name})`,
        )
      const isBridge = (BRIDGE_EVENTS as readonly string[]).includes(name)
      const ev = withNamedInputs(abiEvent(projectAbi, name), [
        'receiptHash',
        'receipt',
      ])
      events.set(...entry(isBridge ? 'bridge' : 'marker', ev))
    }
    out.set(descriptor.address, { descriptor, events })
  }
  return out
}

/** lowercase address -> contract + decodable events */
export const REGISTRY: ReadonlyMap<Address, RegistryEntry> = buildRegistry()

export function lookupContract(address: string): RegistryEntry | undefined {
  return REGISTRY.get(address.toLowerCase() as Address)
}
