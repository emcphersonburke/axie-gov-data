import { useEffect, useState } from 'react'

const canMatch = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/** Reactive `matchMedia` — updates when the query starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    canMatch() ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    if (!canMatch()) return
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
