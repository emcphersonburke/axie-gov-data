import axios from 'axios'

export const fetchBlockTimestamp = async (blockNumber: string) => {
  const blockPayload = {
    jsonrpc: '2.0',
    method: 'eth_getBlockByNumber',
    params: [blockNumber, true],
    id: 1,
  }

  const response = await axios.post(
    process.env.RONIN_API_ENDPOINT,
    blockPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.RONIN_API_KEY,
      },
    },
  )

  if (response.data.error) {
    throw new Error(response.data.error.message)
  }

  return response.data.result.timestamp
}
