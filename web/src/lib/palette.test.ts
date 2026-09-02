import { describe, expect, it } from 'vitest'

import { PALETTE_FALLBACK, pieBaseColor, pieColor } from './palette'

describe('pieColor', () => {
  it('maps known labels case-insensitively', () => {
    expect(pieBaseColor('Axie')).toBe(PALETTE_FALLBACK.aqua)
    expect(pieBaseColor('rune mint')).toBe(PALETTE_FALLBACK['cool-gray'])
    expect(pieColor('Charm Mint')).toBe(
      `${PALETTE_FALLBACK['brilliant-rose']}dd`,
    )
  })

  it('falls back to a gray for unknown labels instead of "undefineddd"', () => {
    const color = pieColor('Some Future Type')
    expect(color).toMatch(/^#[0-9a-f]{6}dd$/i)
    expect(color).not.toContain('undefined')
    expect(pieBaseColor(42)).toBe(PALETTE_FALLBACK['slate-gray'])
  })
})
