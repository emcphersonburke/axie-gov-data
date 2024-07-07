import Web3, { AbiEventFragment } from 'web3'

import { axieInfinityAbi } from './abi'

const web3 = new Web3()

export enum Events {
  AdminChanged = 'AdminChanged',
  AdminRemoved = 'AdminRemoved',
  Approval = 'Approval',
  ApprovalForAll = 'ApprovalForAll',
  AxieBreedCountUpdated = 'AxieBreedCountUpdated',
  AxieEvolved = 'AxieEvolved',
  AxieLevelUpdated = 'AxieLevelUpdated',
  AxieMinted = 'AxieMinted',
  AxieSpawn = 'AxieSpawn',
  AxieggMinted = 'AxieggMinted',
  AxieggSpawned = 'AxieggSpawned',
  Initialized = 'Initialized',
  MinterAdded = 'MinterAdded',
  MinterRemoved = 'MinterRemoved',
  NonceUpdated = 'NonceUpdated',
  Paused = 'Paused',
  PermissionSet = 'PermissionSet',
  PermissionSetAll = 'PermissionSetAll',
  RoleAdminChanged = 'RoleAdminChanged',
  RoleGranted = 'RoleGranted',
  RoleRevoked = 'RoleRevoked',
  SeederAdded = 'SeederAdded',
  SeederRemoved = 'SeederRemoved',
  SpenderUnwhitelisted = 'SpenderUnwhitelisted',
  SpenderWhitelisted = 'SpenderWhitelisted',
  TokenOperatorSet = 'TokenOperatorSet',
  TokenPermissionSet = 'TokenPermissionSet',
  Transfer = 'Transfer',
  Unpaused = 'Unpaused',
}

// Function to calculate the event signature hash
const getEventSignatureHash = (
  eventName: string,
  eventInputs: any[],
): string => {
  const inputs = eventInputs
    .map((input: { type: string }) => input.type)
    .join(',')
  const signature = `${eventName}(${inputs})`
  return web3.utils.sha3(signature) || ''
}

// Filter out non-event ABI definitions and ensure events have the `name` property
const eventAbi = axieInfinityAbi.filter(
  (item): item is AbiEventFragment => item.type === 'event' && 'name' in item,
)

const eventSignatureMap: { [key in Events]?: string } = {}

eventAbi.forEach((event) => {
  if (event.name && Events[event.name as keyof typeof Events]) {
    const mutableInputs = [...event.inputs]
    eventSignatureMap[event.name as keyof typeof Events] =
      getEventSignatureHash(event.name, mutableInputs)
  }
})

export const getEventHash = (eventName: Events): string | undefined => {
  return eventSignatureMap[eventName]
}
