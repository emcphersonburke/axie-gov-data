import type { Address } from 'viem'

/**
 * Ronin mainnet addresses the indexer cares about. These are public on-chain
 * facts, so they live in code rather than env; everything is lowercase so
 * comparisons never depend on checksum casing (the legacy sync compared raw
 * env strings and silently matched nothing when a checksummed address was
 * pasted).
 */
export const CHAIN_ID = 2020 as const

export const ADDRESSES = {
  TREASURY: '0x245db945c485b68fdc429e4f7085a1761aa4d45d',
  MARKETPLACE: '0xfff9ce5f71ca6178d3beecedb61e7eff1602950e',
  PORTAL: '0x36b628e771b0ca12a135e0a7b8e0394f99dce95b',
  RONIN_GATEWAY: '0x0cf8ff40a508bdbc39fbe1bb679dcba64e65c7df',
  AXS: '0x97a9107c1793bc407d6f527b77e7fff4d812bece',
  WETH: '0xc99a6a985ed2cac1ef41640596c5a5f9f4e19ef5',
  AXIE: '0x32950db2a7164ae833121501c797d79e7b79d74c',
  AXIE_ACCESSORY: '0xbd1f28aabe799df4735d8da3841007580e509f08',
  AXIE_ASCEND: '0xdd1cf28ab12413501ea6750083dc027c5857f4d0',
  ATIAS_BLESSING: '0x9d3936dbd9a794ee31ef9f13814233d435bd806c',
  LAND: '0x8c811e3c958e190f5ec15fb376533a3398620500',
  LAND_ITEM: '0xa96660f0e4a3e9bc7388925d245a6d4d79e21259',
  MATERIAL: '0x12b707c3d2786570cfdc3a998a085b62acdba4b3',
  RUNE: '0xc25970724f032af21d801978c73653c440cf787c',
  CHARM: '0x814a9c959a3ef6ca44b5e2349e3bba9845393947',
  PART_EVOLUTION: '0x6e8699915b5328363855af28543d4bdb7439db71',
  CONSUMABLE_ITEM: '0x737b80335a9396a8658405d7adcbc57343ff0558',
} as const satisfies Record<string, Address>

export type ContractKey = keyof typeof ADDRESSES

/** Community Treasury creation block. Starting here costs ~50 extra empty getLogs calls vs the first fee tx (17,349,945) and removes a dependence on that fact. */
export const TREASURY_START_BLOCK = 16_377_111
/** Ronin Gateway (bridge) contract creation block. */
export const BRIDGE_START_BLOCK = 14_765_762
/** Blocks behind head treated as final: ~90 s on Ronin, and enough to stay behind every load-balanced replica's head. */
export const DEFAULT_CONFIRMATIONS = 30

/**
 * WETH sitting in the Community Treasury that no ETH on Ethereum backs, a consequence of the
 * March 2022 Ronin bridge hack: 173,600 ETH was stolen, Sky Mavis refunded 117,600 ETH of user
 * funds, and the remaining 56,000 ETH of shortfall was left against the community treasury. The
 * treasury's WETH balance is therefore only spendable down to this figure — the rest is a claim on
 * Sky Mavis, not on the bridge.
 *
 * Source: Sky Mavis staff in the Axie developer Discord, 2024-07-04 ("there is 58.5k weth in the
 * treasury, but 56k from it is unbacked"). The dashboard's original hardcoded "Backed WETH" values
 * (2,087.9213 in Jul 2024 and 2,618.2305 in Dec 2024) both reconcile to the treasury balance at the
 * time minus ~56,000. Revisit if Sky Mavis ever restores the backing.
 */
export const UNBACKED_WETH_FROM_HACK = 56_000

export const TX_TYPES = [
  'sale',
  'rc-mint',
  'ascension',
  'breeding',
  'evolution',
  'atiablessing',
  'outflow',
  'unknown',
] as const
export type TxType = (typeof TX_TYPES)[number]

export const NFT_TYPES = [
  'Axie',
  'Land',
  'Land Item',
  'Rune',
  'Charm',
  'Material',
  'Accessory',
  'Consumable Item',
  'Mixed',
  'None',
] as const
export type NftType = (typeof NFT_TYPES)[number]
export type NftKind = Exclude<NftType, 'Mixed' | 'None'>

export type TokenStandard = 'erc20' | 'erc721' | 'erc1155' | 'system'

export interface ContractDescriptor {
  key: ContractKey
  address: Address
  standard: TokenStandard
  /** Set for NFT contracts: the label the dashboard groups by. */
  nftType?: NftKind
  /** Event names on this contract that drive transaction classification. */
  markerEvents?: readonly string[]
}

export const CONTRACTS: readonly ContractDescriptor[] = [
  { key: 'AXS', address: ADDRESSES.AXS, standard: 'erc20' },
  { key: 'WETH', address: ADDRESSES.WETH, standard: 'erc20' },
  {
    key: 'AXIE',
    address: ADDRESSES.AXIE,
    standard: 'erc721',
    nftType: 'Axie',
    markerEvents: ['AxieSpawn'],
  },
  { key: 'LAND', address: ADDRESSES.LAND, standard: 'erc721', nftType: 'Land' },
  {
    key: 'LAND_ITEM',
    address: ADDRESSES.LAND_ITEM,
    standard: 'erc1155',
    nftType: 'Land Item',
  },
  {
    key: 'RUNE',
    address: ADDRESSES.RUNE,
    standard: 'erc1155',
    nftType: 'Rune',
  },
  {
    key: 'CHARM',
    address: ADDRESSES.CHARM,
    standard: 'erc1155',
    nftType: 'Charm',
  },
  {
    key: 'MATERIAL',
    address: ADDRESSES.MATERIAL,
    standard: 'erc1155',
    nftType: 'Material',
  },
  {
    key: 'AXIE_ACCESSORY',
    address: ADDRESSES.AXIE_ACCESSORY,
    standard: 'erc721',
    nftType: 'Accessory',
  },
  {
    key: 'CONSUMABLE_ITEM',
    address: ADDRESSES.CONSUMABLE_ITEM,
    standard: 'erc1155',
    nftType: 'Consumable Item',
  },
  {
    key: 'AXIE_ASCEND',
    address: ADDRESSES.AXIE_ASCEND,
    standard: 'system',
    markerEvents: ['AxieLevelAscended'],
  },
  {
    key: 'ATIAS_BLESSING',
    address: ADDRESSES.ATIAS_BLESSING,
    standard: 'system',
    markerEvents: ['PrayerCountSynced'],
  },
  {
    key: 'PART_EVOLUTION',
    address: ADDRESSES.PART_EVOLUTION,
    standard: 'system',
    markerEvents: ['PartEvolutionCreated'],
  },
  {
    key: 'RONIN_GATEWAY',
    address: ADDRESSES.RONIN_GATEWAY,
    standard: 'system',
    markerEvents: ['Deposited', 'WithdrawalRequested'],
  },
  { key: 'MARKETPLACE', address: ADDRESSES.MARKETPLACE, standard: 'system' },
  { key: 'PORTAL', address: ADDRESSES.PORTAL, standard: 'system' },
]

/** address (lowercase) -> descriptor */
export const CONTRACT_BY_ADDRESS: ReadonlyMap<Address, ContractDescriptor> =
  new Map(CONTRACTS.map((c) => [c.address, c]))

/** Port of the legacy getNftType(): the NFT label for a contract address, or undefined when it is not a tracked NFT contract. */
export function nftTypeForAddress(address: string): NftKind | undefined {
  return CONTRACT_BY_ADDRESS.get(address.toLowerCase() as Address)?.nftType
}
