import type { Theme } from '@nivo/core'

/**
 * Colors come from `_variables.scss`, emitted as `:root` custom properties by
 * `global.scss`. We read them lazily (so the stylesheet is applied by then) and
 * fall back to the same literal values for jsdom or before CSS is ready.
 */
export const PALETTE_FALLBACK = {
  aqua: '#00f5f8',
  'brilliant-rose': '#fa59a0',
  cerulean: '#007fa8',
  'cool-gray': '#8e97a8',
  'dodger-blue': '#0094ff',
  fulvous: '#dd8a0e',
  'kelly-green': '#6db80f',
  'medium-slate-blue': '#9967fb',
  'raisin-black': '#1c1f25',
  'rich-black': '#13161b',
  'slate-gray': '#5c6370',
  'warning-yellow': '#ffcc00',
} as const

export type PaletteKey = keyof typeof PALETTE_FALLBACK

const cache = new Map<PaletteKey, string>()

export function paletteColor(key: PaletteKey): string {
  const cached = cache.get(key)
  if (cached) return cached
  let value = ''
  if (
    typeof document !== 'undefined' &&
    typeof getComputedStyle === 'function'
  ) {
    value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${key}`)
      .trim()
  }
  if (!value) return PALETTE_FALLBACK[key]
  cache.set(key, value)
  return value
}

/** Growth line colors per token. */
export const lineColor = (token: 'axs' | 'weth'): string =>
  paletteColor(token === 'axs' ? 'medium-slate-blue' : 'dodger-blue')

/** Pie slice → palette key, keyed by lower-cased slice label. */
const PIE_COLOR_KEYS: Record<string, PaletteKey> = {
  // NFT types
  accessory: 'fulvous',
  axie: 'aqua',
  charm: 'brilliant-rose',
  'consumable item': 'cerulean',
  land: 'kelly-green',
  'land item': 'dodger-blue',
  material: 'medium-slate-blue',
  mixed: 'fulvous',
  rune: 'cool-gray',
  // transaction types
  ascension: 'dodger-blue',
  'blessing streak restore': 'medium-slate-blue',
  breeding: 'aqua',
  'charm mint': 'brilliant-rose',
  evolution: 'kelly-green',
  'marketplace sale': 'cerulean',
  other: 'slate-gray',
  'rune mint': 'cool-gray',
  'rune/charm mint': 'cool-gray',
}

/** Solid color for a pie slice; unknown labels get a neutral gray instead of "undefined". */
export function pieBaseColor(id: string | number): string {
  const key = PIE_COLOR_KEYS[String(id).toLowerCase()]
  return paletteColor(key ?? 'slate-gray')
}

/** Slice fill: the base color with the legacy `dd` alpha suffix. */
export const pieColor = (id: string | number): string => `${pieBaseColor(id)}dd`

export function nivoTheme(): Theme {
  const text = '#ffffff'
  const muted = '#777777'
  return {
    text: { fill: text, fontSize: 12 },
    axis: {
      domain: { line: { stroke: muted, strokeWidth: 1 } },
      legend: { text: { fontSize: 12, fill: text } },
      ticks: {
        line: { stroke: muted, strokeWidth: 1 },
        text: { fontSize: 11, fill: text },
      },
    },
    grid: { line: { stroke: '#444444', strokeWidth: 1 } },
    legends: { text: { fontSize: 12, fill: text } },
    tooltip: {
      container: {
        background: paletteColor('raisin-black'),
        color: text,
        fontSize: 12,
      },
    },
    labels: { text: { fontSize: 11, fill: text } },
    markers: {
      lineColor: text,
      lineStrokeWidth: 1,
      text: {
        fontSize: 12,
        fill: text,
        fontFamily: 'sans-serif',
        outlineWidth: 0,
        outlineColor: 'transparent',
        outlineOpacity: 1,
      },
    },
  }
}

/** Tooltip container background shared by the custom chart tooltips. */
export const tooltipBackground = (): string => paletteColor('raisin-black')
