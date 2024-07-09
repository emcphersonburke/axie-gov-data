import Web3, { AbiItem } from 'web3'

const isAbiEventWithName = (item: any): item is AbiItem & { name: string } => {
  return (
    item.type === 'event' && 'name' in item && typeof item.name === 'string'
  )
}

export const decodeLogs = (logs: any[], abi: AbiItem[], web3: Web3) => {
  const eventAbi = abi.filter(isAbiEventWithName)
  return logs
    .map((log) => {
      try {
        const event = eventAbi.find(
          (event) => web3.eth.abi.encodeEventSignature(event) === log.topics[0],
        )
        if (!event) {
          return null
        }
        const decodedLog = web3.eth.abi.decodeLog(
          event.inputs as any[],
          log.data,
          log.topics.slice(1),
        )

        if (event.name === 'Transfer' && decodedLog._value) {
          decodedLog._value = web3.utils.fromWei(
            decodedLog._value.toString(),
            'ether',
          )
        }

        return {
          event: event.name,
          decodedLog,
          transactionHash: log.transactionHash,
          contractAddress: log.address,
          blockNumber: log.blockNumber,
        }
      } catch (error) {
        console.error('Error decoding log', error, log)
        return null
      }
    })
    .filter((log) => log !== null)
}
