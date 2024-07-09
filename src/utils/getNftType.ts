export const getNftType = (contractAddress: string): string => {
  const nftTypeMapping: { [key: string]: string } = {
    [process.env.AXIE_TOKEN_CONTRACT_ADDRESS]: 'Axie',
    [process.env.LAND_TOKEN_CONTRACT_ADDRESS]: 'Land',
    [process.env.RUNE_TOKEN_CONTRACT_ADDRESS]: 'Rune',
    [process.env.CHARM_TOKEN_CONTRACT_ADDRESS]: 'Charm',
  }
  return nftTypeMapping[contractAddress] || 'Unknown'
}
