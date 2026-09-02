import type { DashboardSnapshot } from '@axie-gov/shared'
import { dashboardSnapshotSchema, RANGE_KEYS } from '@axie-gov/shared'

export const DATA_URL: string =
  import.meta.env.VITE_DATA_URL ?? '/data/dashboard.json'

export type SnapshotFetchErrorKind = 'network' | 'http' | 'parse' | 'schema'

/** A fetch failure with a message safe to show to visitors. */
export class SnapshotFetchError extends Error {
  readonly kind: SnapshotFetchErrorKind
  constructor(kind: SnapshotFetchErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'SnapshotFetchError'
    this.kind = kind
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * Load and validate dashboard.json. `cache: 'no-cache'` lets the browser
 * revalidate with the CDN (cheap 304s) without ever serving a stale copy.
 * Rejects with `SnapshotFetchError` (or the abort error when aborted).
 */
export async function fetchSnapshot(
  url: string = DATA_URL,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-cache', signal })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new SnapshotFetchError(
      'network',
      'Could not reach the data server. Check your connection and try again.',
      error,
    )
  }

  if (!response.ok) {
    throw new SnapshotFetchError(
      'http',
      `The data server responded with ${response.status}${
        response.statusText ? ` ${response.statusText}` : ''
      }. Please try again in a moment.`,
    )
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    if (isAbort(error)) throw error
    throw new SnapshotFetchError(
      'parse',
      'The dashboard data could not be read (the response was not valid JSON).',
      error,
    )
  }

  const parsed = dashboardSnapshotSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : ''
    throw new SnapshotFetchError(
      'schema',
      `The dashboard data has an unexpected shape${where}${
        issue ? ` (${issue.message})` : ''
      }. The site may be mid-deploy — please try again shortly.`,
      parsed.error,
    )
  }

  const missing = RANGE_KEYS.filter(
    (key) => parsed.data.ranges[key] === undefined,
  )
  if (missing.length > 0) {
    throw new SnapshotFetchError(
      'schema',
      `The dashboard data is missing the ${missing.join(', ')} range${
        missing.length > 1 ? 's' : ''
      }. Please try again shortly.`,
    )
  }

  return parsed.data
}

export const describeError = (error: unknown): string =>
  error instanceof SnapshotFetchError
    ? error.message
    : 'Something went wrong while loading the dashboard data.'
