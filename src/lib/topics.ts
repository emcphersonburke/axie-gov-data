import Web3 from 'web3'

const web3 = new Web3(process.env.RONIN_API_ENDPOINT)

export const transferTopic = web3.eth.abi.encodeEventSignature({
  name: 'Transfer',
  type: 'event',
  inputs: [
    { type: 'address', name: '_from', indexed: true },
    { type: 'address', name: '_to', indexed: true },
    { type: 'uint256', name: '_value', indexed: false },
  ],
})

export const depositedTopic = web3.eth.abi.encodeEventSignature({
  name: 'Deposited',
  type: 'event',
  inputs: [
    { type: 'bytes32', name: 'receiptHash', indexed: false },
    {
      type: 'tuple',
      name: 'receipt',
      components: [
        { type: 'uint256', name: 'param1' },
        { type: 'uint8', name: 'param2' },
        {
          type: 'tuple',
          name: 'param3',
          components: [
            { type: 'address', name: 'fromAddress' },
            { type: 'address', name: 'toAddress' },
            { type: 'uint256', name: 'value' },
          ],
        },
        {
          type: 'tuple',
          name: 'param4',
          components: [
            { type: 'address', name: 'fromAddress' },
            { type: 'address', name: 'toAddress' },
            { type: 'uint256', name: 'value' },
          ],
        },
        {
          type: 'tuple',
          name: 'param5',
          components: [
            { type: 'uint8', name: 'param1' },
            { type: 'uint256', name: 'param2' },
            { type: 'uint256', name: 'param3' },
          ],
        },
      ],
    },
  ],
})

export const withdrawalRequestedTopic = web3.eth.abi.encodeEventSignature({
  name: 'WithdrawalRequested',
  type: 'event',
  inputs: [
    { type: 'bytes32', name: 'receiptHash', indexed: false },
    {
      type: 'tuple',
      name: 'arg1',
      components: [
        { type: 'uint256', name: 'param1' },
        { type: 'uint8', name: 'param2' },
        {
          type: 'tuple',
          name: 'param3',
          components: [
            { type: 'address', name: 'fromAddress' },
            { type: 'address', name: 'toAddress' },
            { type: 'uint256', name: 'value' },
          ],
        },
        {
          type: 'tuple',
          name: 'param4',
          components: [
            { type: 'address', name: 'fromAddress' },
            { type: 'address', name: 'toAddress' },
            { type: 'uint256', name: 'value' },
          ],
        },
        {
          type: 'tuple',
          name: 'param5',
          components: [
            { type: 'uint8', name: 'param1' },
            { type: 'uint256', name: 'param2' },
            { type: 'uint256', name: 'param3' },
          ],
        },
      ],
    },
  ],
})
