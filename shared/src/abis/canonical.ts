import { parseAbi } from 'viem'

/**
 * Minimal, canonical event ABIs per token standard.
 *
 * The project ABIs disagree on parameter names (`_from/_to/_tokenId` on the
 * Axie/Land contracts vs `from/to/tokenId` on Accessory), and ERC-20 and
 * ERC-721 `Transfer` share the same topic0. Decoding against these canonical
 * shapes, dispatched by contract address, gives the classifier one stable
 * field set regardless of which contract emitted the log.
 */
export const erc20EventsAbi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

export const erc721EventsAbi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

export const erc1155EventsAbi = parseAbi([
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
])
