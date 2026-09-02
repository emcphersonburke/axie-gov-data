/** Feature probes used to decide whether the decorative terrarium should load at all. */

let webgl: boolean | null = null

export function supportsWebGL(): boolean {
  if (webgl !== null) return webgl
  try {
    const canvas = document.createElement('canvas')
    webgl = Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    )
  } catch {
    webgl = false
  }
  return webgl
}

interface NetworkInformationLike {
  saveData?: boolean
}

export function prefersSaveData(): boolean {
  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection
  return connection?.saveData === true
}

/** Run `fn` once the browser is idle; falls back to a short timeout. Returns a canceller. */
export function onIdle(fn: () => void, timeoutMs = 4000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => fn(), { timeout: timeoutMs })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 2000)
  return () => window.clearTimeout(id)
}
