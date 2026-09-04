import { dashboardSnapshotSchema } from '@axie-gov/shared/snapshot'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import fixture from '../../../fixtures/dashboard.json'
import TreasuryTotals from './TreasuryTotals'

const snapshot = dashboardSnapshotSchema.parse(fixture)

const usd = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const token = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

describe('<TreasuryTotals>', () => {
  it('renders four tiles from props with the correct USD value and no loading state', () => {
    const { container } = render(
      <TreasuryTotals totals={snapshot.totals} rates={snapshot.rates} />,
    )

    expect(screen.getByText('Total AXS')).toBeTruthy()
    expect(screen.getByText('Total WETH')).toBeTruthy()
    expect(screen.getByText(/Backed WETH/)).toBeTruthy()
    expect(screen.getByText('Total AXS + WETH as USD')).toBeTruthy()

    expect(
      screen.getByText(`${token.format(snapshot.totals.net.axs)} AXS`),
    ).toBeTruthy()
    expect(
      screen.getByText(`${token.format(snapshot.totals.net.weth)} WETH`),
    ).toBeTruthy()
    expect(
      screen.getByText(`${token.format(snapshot.totals.backedWeth)} WETH`),
    ).toBeTruthy()

    const expectedUsd =
      snapshot.totals.net.axs * (snapshot.rates.axsUsd ?? 0) +
      snapshot.totals.net.weth * (snapshot.rates.ethUsd ?? 0)
    expect(screen.getByText(`$${usd.format(expectedUsd)}`)).toBeTruthy()

    expect(container.textContent).not.toMatch(/loading/i)
  })

  it('shows the hack-adjusted backed WETH and explains the shortfall', () => {
    render(<TreasuryTotals totals={snapshot.totals} rates={snapshot.rates} />)
    const tooltip = screen.getByRole('tooltip').textContent ?? ''
    expect(tooltip).toMatch(/March 2022 Ronin bridge hack/)
    expect(tooltip).toMatch(/173,600/)
    expect(screen.getByText(/56,000 ETH of shortfall/)).toBeTruthy()
    // the tile shows net WETH minus the shortfall, not the raw balance
    expect(snapshot.totals.backedWeth).toBeCloseTo(
      snapshot.totals.net.weth - snapshot.totals.unbackedWeth,
      6,
    )
    expect(
      screen.getByText(`${token.format(snapshot.totals.backedWeth)} WETH`),
    ).toBeTruthy()
  })

  it('shows a dash instead of a USD value when rates are missing', () => {
    render(
      <TreasuryTotals
        totals={snapshot.totals}
        rates={{ ...snapshot.rates, axsUsd: null }}
      />,
    )
    expect(screen.getByTitle('Exchange rates unavailable').textContent).toBe(
      '—',
    )
  })
})
