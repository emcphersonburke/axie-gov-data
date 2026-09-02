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
      <TreasuryTotals
        totals={snapshot.totals}
        bridge={snapshot.bridge}
        rates={snapshot.rates}
      />,
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
      screen.getByText(`${token.format(snapshot.bridge.all.net)} WETH`),
    ).toBeTruthy()

    const expectedUsd =
      snapshot.totals.net.axs * (snapshot.rates.axsUsd ?? 0) +
      snapshot.totals.net.weth * (snapshot.rates.ethUsd ?? 0)
    expect(screen.getByText(`$${usd.format(expectedUsd)}`)).toBeTruthy()

    expect(container.textContent).not.toMatch(/loading/i)
  })

  it('explains Backed WETH as the chain-wide bridge net', () => {
    render(
      <TreasuryTotals
        totals={snapshot.totals}
        bridge={snapshot.bridge}
        rates={snapshot.rates}
      />,
    )
    expect(screen.getByRole('tooltip').textContent).toMatch(
      /bridged onto Ronin minus WETH withdrawn, chain-wide, through the Ronin Gateway/,
    )
  })

  it('shows a dash instead of a USD value when rates are missing', () => {
    render(
      <TreasuryTotals
        totals={snapshot.totals}
        bridge={snapshot.bridge}
        rates={{ ...snapshot.rates, axsUsd: null }}
      />,
    )
    expect(screen.getByTitle('Exchange rates unavailable').textContent).toBe(
      '—',
    )
  })
})
