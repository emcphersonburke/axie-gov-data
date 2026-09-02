import type { Config } from '../config.js'
import type { Statements } from '../db/statements.js'
import { getMeta, setMeta } from '../db/statements.js'
import type { Logger } from '../logger.js'

export interface Rates {
  axsUsd: number | null
  ethUsd: number | null
  /** ISO time of the last successful fetch */
  fetchedAt: string | null
}

export interface RatesView extends Rates {
  stale: boolean
}

const QUERY = 'query { exchangeRate { axs { usd } eth { usd } } }'

type FetchFn = (input: string, init: RequestInit) => Promise<Response>

/** AXS/ETH → USD from the Sky Mavis marketplace GraphQL (same query the old page used). */
export async function fetchRates(
  url: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
  now = () => new Date(),
): Promise<Rates> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ query: QUERY }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`rates: HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: {
      exchangeRate?: {
        axs?: { usd?: number | null }
        eth?: { usd?: number | null }
      }
    }
    errors?: Array<{ message: string }>
  }
  if (json.errors?.length)
    throw new Error(`rates: ${json.errors.map((e) => e.message).join('; ')}`)
  const axs = json.data?.exchangeRate?.axs?.usd
  const eth = json.data?.exchangeRate?.eth?.usd
  if (typeof axs !== 'number' || typeof eth !== 'number')
    throw new Error('rates: unexpected response shape')
  return { axsUsd: axs, ethUsd: eth, fetchedAt: now().toISOString() }
}

/**
 * Keeps the last good rates (persisted in `meta` so a restart does not blank
 * the tiles), refreshes every RATES_INTERVAL_MS, and flags `stale` once the
 * value is older than RATES_STALE_MS.
 */
export class RatesTracker {
  private rates: Rates = { axsUsd: null, ethUsd: null, fetchedAt: null }
  private lastAttemptAt = 0

  constructor(
    private readonly config: Pick<
      Config,
      'RATES_URL' | 'RONIN_API_KEY' | 'RATES_INTERVAL_MS' | 'RATES_STALE_MS'
    >,
    private readonly stmts: Statements,
    private readonly log: Logger,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    const json = getMeta(stmts, 'rates_json')
    if (json) {
      try {
        this.rates = JSON.parse(json) as Rates
      } catch {
        this.log.warn('ignoring unparsable rates_json in meta')
      }
    }
  }

  current(now = Date.now()): RatesView {
    const fetchedAt = this.rates.fetchedAt
      ? Date.parse(this.rates.fetchedAt)
      : Number.NaN
    const stale =
      !Number.isFinite(fetchedAt) ||
      now - fetchedAt > this.config.RATES_STALE_MS
    return { ...this.rates, stale }
  }

  /** Fetch if the interval has elapsed since the last attempt; failures keep the previous value. */
  async refreshIfDue(now = Date.now(), force = false): Promise<boolean> {
    if (!force && now - this.lastAttemptAt < this.config.RATES_INTERVAL_MS)
      return false
    this.lastAttemptAt = now
    try {
      this.rates = await fetchRates(
        this.config.RATES_URL,
        this.config.RONIN_API_KEY,
        this.fetchFn,
      )
      setMeta(this.stmts, 'rates_json', JSON.stringify(this.rates))
      setMeta(this.stmts, 'rates_fetched_at', this.rates.fetchedAt ?? '')
      this.log.debug(
        { axsUsd: this.rates.axsUsd, ethUsd: this.rates.ethUsd },
        'rates refreshed',
      )
      return true
    } catch (err) {
      this.log.warn(
        { err: (err as Error).message },
        'rates fetch failed; keeping previous value',
      )
      return false
    }
  }
}
