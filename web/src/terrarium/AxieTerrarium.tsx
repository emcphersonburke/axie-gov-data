import { Application, utils } from 'pixi.js'
import { useEffect, useRef } from 'react'

import styles from './AxieTerrarium.module.scss'
import { spawnAxie } from './spawnAxie'

const AXIE_VARIATIONS = [
  { animation: 'action/idle/normal', speed: 1 },
  { animation: 'action/move-back', speed: 2.6 },
  { animation: 'action/run', speed: 5.9 },
  { animation: 'activity/appear', speed: 3 },
  { animation: 'activity/entrance', speed: 0.5 },
  { animation: 'activity/victory-pose-back-flip', speed: 2.7 },
  { animation: 'attack/melee/multi-attack', speed: 2.2 },
  { animation: 'attack/melee/tail-smash', speed: 2.3 },
  { animation: 'attack/ranged/cast-tail', speed: 2.25 },
  { animation: 'attack/ranged/cast-multi', speed: 1.5 },
  { animation: 'attack/ranged/cast-fly', speed: 5 },
  { animation: 'defense/hit-by-ranged-attack', speed: 3.1 },
  { animation: 'defense/hit-by-normal-crit', speed: 8 },
  { animation: 'draft/run-origin', speed: 6 },
] as const

/** Random spawn gap: 5–10 s. */
const MIN_SPAWN_GAP_MS = 5000
const spawnGap = () => Math.random() * 5000 + MIN_SPAWN_GAP_MS

/**
 * Transparent PIXI canvas laid over the page where random Axies wander across.
 * Purely decorative: paused while the tab is hidden and torn down on unmount.
 */
export default function AxieTerrarium() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !utils.isWebGLSupported()) return

    const app = new Application({ resizeTo: container, backgroundAlpha: 0 })
    container.appendChild(app.view as HTMLCanvasElement)
    app.stage.sortableChildren = true

    /** Disposers for every axie currently on stage. */
    const live = new Set<() => void>()
    let destroyed = false
    let spawnTimer = 0
    let lastSpawnAt = performance.now()

    const spawn = () => {
      const variation =
        AXIE_VARIATIONS[Math.floor(Math.random() * AXIE_VARIATIONS.length)] ??
        AXIE_VARIATIONS[0]
      let dispose: (() => void) | null = null
      spawnAxie(app, {
        direction: Math.random() > 0.5 ? 'left' : 'right',
        animation: variation.animation,
        speed: variation.speed,
        y: window.scrollY + Math.random() * window.innerHeight,
        onExit: () => {
          if (dispose) live.delete(dispose)
        },
      })
        .then((d) => {
          dispose = d
          if (destroyed) d()
          else live.add(d)
        })
        .catch((error: unknown) => {
          console.warn('[terrarium] failed to spawn axie', error)
        })
    }

    const scheduleNextSpawn = () => {
      window.clearTimeout(spawnTimer)
      lastSpawnAt = performance.now()
      spawnTimer = window.setTimeout(() => {
        spawn()
        scheduleNextSpawn()
      }, spawnGap())
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearTimeout(spawnTimer)
        app.ticker.stop()
      } else {
        app.ticker.start()
        if (performance.now() - lastSpawnAt >= MIN_SPAWN_GAP_MS) spawn()
        scheduleNextSpawn()
      }
    }

    // `resizeTo` only tracks window resizes; the page can grow without one.
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            if (!destroyed)
              app.renderer.resize(container.clientWidth, container.clientHeight)
          })
        : null
    observer?.observe(container)

    if (!document.hidden) scheduleNextSpawn()
    else app.ticker.stop()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      destroyed = true
      window.clearTimeout(spawnTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer?.disconnect()
      for (const dispose of live) dispose()
      live.clear()
      app.destroy(true)
    }
  }, [])

  return (
    <div className={styles.terrarium} ref={containerRef} aria-hidden="true" />
  )
}
