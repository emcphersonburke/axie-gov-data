'use client'

import { Application } from 'pixi.js'
import React, { useEffect, useRef, useState } from 'react'

import Axie from '../Axie/Axie'
import styles from './AxieTerrarium.module.scss'

interface AxieData {
  id: number
  direction: 'left' | 'right'
  animation: string
  speed: number
  y: number
}

const axieVariations = [
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
]

export default function AxieTerrarium() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application>(null)
  const [axies, setAxies] = useState<AxieData[]>([])
  const axieIdRef = useRef(0)
  const spawnIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!containerRef.current || !window) return

    const container = containerRef.current
    const app = new Application({
      resizeTo: container,
      backgroundAlpha: 0,
    })
    appRef.current = app
    container.appendChild(app.view as HTMLCanvasElement)

    const handleResize = () => {
      app.renderer.resize(container.clientWidth, container.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    const spawnAxie = () => {
      axieIdRef.current += 1
      const variation =
        axieVariations[Math.floor(Math.random() * axieVariations.length)]
      const newAxie: AxieData = {
        id: axieIdRef.current,
        direction: Math.random() > 0.5 ? 'left' : 'right',
        animation: variation.animation,
        speed: variation.speed,
        y: window.scrollY + Math.random() * window.innerHeight,
      }
      setAxies((prevAxies) => [...prevAxies, newAxie])
    }

    const scheduleNextSpawn = () => {
      const randomInterval = Math.random() * 5000 + 5000 // Random interval between 5 to 10 seconds
      spawnIntervalRef.current = setTimeout(() => {
        spawnAxie()
        scheduleNextSpawn()
      }, randomInterval)
    }

    scheduleNextSpawn()

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (spawnIntervalRef.current) {
          clearTimeout(spawnIntervalRef.current)
        }
      } else {
        scheduleNextSpawn()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (appRef.current) {
        appRef.current.destroy(true)
      }
      if (spawnIntervalRef.current) {
        clearTimeout(spawnIntervalRef.current)
      }
    }
  }, [])

  return (
    <div className={styles.terrarium} ref={containerRef}>
      {appRef.current &&
        axies.map((axie) => (
          <Axie
            key={axie.id}
            direction={axie.direction}
            app={appRef.current}
            animation={axie.animation}
            speed={axie.speed}
            y={axie.y}
            onRemove={() =>
              setAxies((prevAxies) => prevAxies.filter((a) => a.id !== axie.id))
            }
          />
        ))}
    </div>
  )
}
