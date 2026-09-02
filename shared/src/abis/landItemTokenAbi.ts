import type { Abi } from 'viem'

export const landItemTokenAbi = [
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AdminChanged',
    inputs: [
      {
        indexed: true,
        name: '_oldAdmin',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_newAdmin',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'AdminRemoved',
    inputs: [
      {
        indexed: true,
        name: '_oldAdmin',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      {
        indexed: true,
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_approved',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'ApprovalForAll',
    inputs: [
      {
        indexed: true,
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'MinterAdded',
    inputs: [
      {
        indexed: true,
        name: '_minter',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'MinterRemoved',
    inputs: [
      {
        indexed: true,
        name: '_minter',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'NonceUpdated',
    inputs: [
      {
        indexed: true,
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        indexed: true,
        name: '_nonce',
        type: 'uint256',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [],
  },
  {
    type: 'event',
    name: 'PermissionSet',
    inputs: [
      {
        indexed: false,
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
      {
        indexed: false,
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'PermissionSetAll',
    inputs: [
      {
        indexed: false,
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'SpenderUnwhitelisted',
    inputs: [
      {
        indexed: true,
        name: '_spender',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'SpenderWhitelisted',
    inputs: [
      {
        indexed: true,
        name: '_spender',
        type: 'address',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'TokenOperatorSet',
    inputs: [
      {
        indexed: false,
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        indexed: false,
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'TokenPermissionSet',
    inputs: [
      {
        indexed: false,
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        indexed: false,
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        indexed: false,
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
      {
        indexed: false,
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      {
        indexed: true,
        name: '_from',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        indexed: true,
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [],
  },
  {
    type: 'function',
    name: 'addMinters',
    inputs: [
      {
        name: '_addedMinters',
        type: 'address[]',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addTokenType',
    inputs: [
      {
        name: '_name',
        type: 'string',
        internalType: '',
      },
      {
        name: '_symbol',
        type: 'string',
        internalType: '',
      },
      {
        name: '_baseTokenURI',
        type: 'string',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'admin',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_balance',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'baseTokenURI',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'batchMint',
    inputs: [
      {
        name: '_recipients',
        type: 'address[]',
        internalType: '',
      },
      {
        name: '_tokenTypes',
        type: 'uint256[]',
        internalType: '',
      },
      {
        name: '_tokenIds',
        type: 'uint256[]',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'changeAdmin',
    inputs: [
      {
        name: '_newAdmin',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deconstructItemId',
    inputs: [
      {
        name: '_itemId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'editTokenMetadata',
    inputs: [
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_name',
        type: 'string',
        internalType: '',
      },
      {
        name: '_symbol',
        type: 'string',
        internalType: '',
      },
      {
        name: '_baseTokenURI',
        type: 'string',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getApproved',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getItemId',
    inputs: [
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTokenTypeCount',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isAuthorized',
    inputs: [
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isFunctionOperatorOfToken',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isMinter',
    inputs: [
      {
        name: '_addr',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isPermissionSet',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isPermissionSetAll',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isTokenOperator',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'mint',
    inputs: [
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'mintNew',
    inputs: [
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenType',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'minter',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'minters',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonces',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operatorPermission',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
      {
        name: '',
        type: 'address',
        internalType: '',
      },
      {
        name: '',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'removeAdmin',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeMinters',
    inputs: [
      {
        name: '_removedMinters',
        type: 'address[]',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'safeTransferFrom',
    inputs: [
      {
        name: '_from',
        type: 'address',
        internalType: '',
      },
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'safeTransferFrom',
    inputs: [
      {
        name: '_from',
        type: 'address',
        internalType: '',
      },
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_data',
        type: 'bytes',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAllPermissionFor',
    inputs: [
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    inputs: [
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setBaseTokenURI',
    inputs: [
      {
        name: '_baseTokenURI',
        type: 'string',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFunctionOperatorForToken',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPermissionFor',
    inputs: [
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_funcSig',
        type: 'bytes4',
        internalType: '',
      },
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTokenOperator',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '_operator',
        type: 'address',
        internalType: '',
      },
      {
        name: '_approved',
        type: 'bool',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stateOf',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'supportsInterface',
    inputs: [
      {
        name: '_interfaceId',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_supported',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenBalance',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenByIndex',
    inputs: [
      {
        name: '_index',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenMetadata',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: 'name',
        type: 'string',
        internalType: '',
      },
      {
        name: 'symbol',
        type: 'string',
        internalType: '',
      },
      {
        name: 'baseTokenURI',
        type: 'string',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: '',
      },
      {
        name: '_index',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenPermission',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '',
        type: 'address',
        internalType: '',
      },
      {
        name: '',
        type: 'bytes4',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenPermissionInfos',
    inputs: [
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
      {
        name: '',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: '',
      },
      {
        name: 'funcSig',
        type: 'bytes4',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '_uri',
        type: 'string',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [
      {
        name: '_supply',
        type: 'uint256',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      {
        name: '_from',
        type: 'address',
        internalType: '',
      },
      {
        name: '_to',
        type: 'address',
        internalType: '',
      },
      {
        name: '_tokenId',
        type: 'uint256',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unwhitelist',
    inputs: [
      {
        name: '_spender',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'whitelist',
    inputs: [
      {
        name: '_spender',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'whitelisted',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: '',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: '',
      },
    ],
    stateMutability: 'view',
  },
] as const satisfies Abi
