import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DashboardView } from '../../src/features/dashboard/DashboardView'
import { makeDashboardSource, mergeDashboardSources } from '../helpers/dashboard-fixture'

describe('DashboardView', () => {
  it('同期中と開始時刻不足の説明を表示する', () => {
    const source = makeDashboardSource()
    delete source.races[0]!.raceStartEvidence
    render(<DashboardView source={{ ...source, syncPending: true }} />)
    expect(screen.getByText(/同期中：/)).toBeInTheDocument()
    expect(screen.getByText(/開始時刻不明の既存データ/)).toBeInTheDocument()
  })
  it('フィルター切替でKPIと表を同じ条件へ更新する', async () => {
    const user = userEvent.setup()
    const source = mergeDashboardSources(
      makeDashboardSource({ organizer: 'JRA', raceId: '2026-11-01-TOKYO-01-JRA' }),
      makeDashboardSource({ organizer: 'NAR', raceId: '2026-11-02-OI-01-NAR', venueCode: 'OI' }),
    )
    render(<DashboardView source={source} />)
    expect(screen.getByText('2レース')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('主催者'), 'NAR')
    expect(screen.getByText('1レース')).toBeInTheDocument()
    expect(screen.getAllByText('NAR').length).toBeGreaterThan(0)
  })

  it('レース0件では空状態と未算出を表示する', () => {
    render(
      <DashboardView source={{ ledgerTransactions: [], races: [], truncated: false }} />,
    )
    expect(
      screen.getByText(/指定条件に該当する実購入記録はありません/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('未算出').length).toBeGreaterThan(0)
  })

  it('日別・週別・月別の切替を操作できる', async () => {
    const user = userEvent.setup()
    render(<DashboardView source={makeDashboardSource()} />)
    const weekly = screen.getByRole('button', { name: '週別' })
    expect(weekly).toHaveAttribute('aria-pressed', 'false')
    await user.click(weekly)
    expect(weekly).toHaveAttribute('aria-pressed', 'true')
  })

  it('スマホカードとPC比較表をレスポンシブに切り替える', () => {
    render(<DashboardView source={makeDashboardSource()} />)
    const mobileLayouts = screen.getAllByTestId('mobile-analysis-layout')
    const desktopLayouts = screen.getAllByTestId('desktop-analysis-layout')
    expect(mobileLayouts[0]).toHaveClass('lg:hidden')
    expect(desktopLayouts[0]).toHaveClass('hidden', 'lg:block')
  })
})
