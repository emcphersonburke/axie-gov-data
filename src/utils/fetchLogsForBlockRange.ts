import axios from 'axios'

export const fetchLogsForBlockRange = async (
  fromBlock: number,
  toBlock: number,
) => {
  const logsPayload = {
    jsonrpc: '2.0',
    method: 'eth_getLogs',
    params: [
      {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
      },
    ],
    id: 1,
  }

  const response = await axios.post(
    process.env.RONIN_API_ENDPOINT,
    logsPayload,
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

  return response.data.result
}
