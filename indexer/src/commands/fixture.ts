import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Hex, RpcBlock, RpcTransactionReceipt } from 'viem'

import type { AppContext } from '../pipeline/context.js'

/** indexer/test/fixtures, whether running from src (tsx) or dist. */
export const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL('../../test/fixtures/', import.meta.url),
)

export interface Fixture {
  name: string
  hash: Hex
  capturedAt: string
  /** raw JSON-RPC receipt, untouched */
  receipt: RpcTransactionReceipt
  block: { number: Hex; timestamp: Hex; hash: Hex }
}

/** Capture a receipt + block header exactly as the RPC returned them, for decode/classify tests. */
export async function captureFixture(
  ctx: AppContext,
  hash: Hex,
  name: string,
  dir = DEFAULT_FIXTURE_DIR,
): Promise<string> {
  const receipt = await ctx.rpc.request<RpcTransactionReceipt | null>(
    'eth_getTransactionReceipt',
    [hash],
  )
  if (!receipt)
    throw new Error(`no receipt for ${hash} (pruned node or wrong hash)`)
  const block = await ctx.rpc.request<RpcBlock | null>('eth_getBlockByNumber', [
    receipt.blockNumber,
    false,
  ])
  if (!block || block.number === null || block.hash === null)
    throw new Error(`no block ${receipt.blockNumber}`)
  const fixture: Fixture = {
    name,
    hash,
    capturedAt: new Date().toISOString(),
    receipt,
    block: {
      number: block.number,
      timestamp: block.timestamp,
      hash: block.hash,
    },
  }
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${name}.json`)
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`)
  ctx.log.info(
    { path, logs: receipt.logs.length, block: Number(receipt.blockNumber) },
    'fixture written',
  )
  return path
}
