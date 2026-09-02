import { lazy, Suspense, useEffect, useState } from 'react'

import ErrorBoundary from '~/components/ErrorBoundary/ErrorBoundary'
import { useMediaQuery } from '~/hooks/useMediaQuery'
import { onIdle, prefersSaveData, supportsWebGL } from '~/lib/capabilities'
import { useSnapshot } from '~/store/useSnapshot'

const AxieTerrarium = lazy(() => import('~/terrarium/AxieTerrarium'))

/**
 * Loads the decorative PIXI terrarium only when it cannot hurt: after the
 * dashboard data is ready, once the browser is idle, and never for visitors
 * who asked for reduced motion or data saving, or lack WebGL.
 */
export default function TerrariumGate() {
  const { status } = useSnapshot()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (status !== 'ready' || idle) return
    return onIdle(() => setIdle(true))
  }, [status, idle])

  if (status !== 'ready' || !idle || reducedMotion) return null
  if (prefersSaveData() || !supportsWebGL()) return null

  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <AxieTerrarium />
      </Suspense>
    </ErrorBoundary>
  )
}
