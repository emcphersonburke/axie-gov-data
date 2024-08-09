export const getNftType = (contractAddress: string): string => {
  const nftTypeMapping: { [key: string]: string } = {
    [process.env.AXIE_TOKEN_CONTRACT_ADDRESS]: 'Axie',
    [process.env.LAND_TOKEN_CONTRACT_ADDRESS]: 'Land',
    [process.env.RUNE_TOKEN_CONTRACT_ADDRESS]: 'Rune',
    [process.env.CHARM_TOKEN_CONTRACT_ADDRESS]: 'Charm',
    [process.env.LAND_ITEM_TOKEN_CONTRACT_ADDRESS]: 'Land Item',
    [process.env.MATERIAL_TOKEN_CONTRACT_ADDRESS]: 'Material',
    [process.env.AXIE_ACCESSORY_TOKEN_CONTRACT_ADDRESS]: 'Accessory',
    [process.env.CONSUMABLE_ITEM_TOKEN_ADDRESS]: 'Consumable Item',
  }
  return nftTypeMapping[contractAddress] || 'Unknown'
}
