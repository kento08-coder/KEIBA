import { describe, expect, it } from 'vitest'
import {
  analyzeDashboard,
  buildTimeSeries,
  calculateCalibration,
  emptyDashboardFilters,
} from '../../src/domain/calculations/dashboard'
import { dashboardBetTypes } from '../../src/domain/types/dashboard'
import { makeDashboardSource, mergeDashboardSources } from '../helpers/dashboard-fixture'

describe('dashboard analytics', () => {
  it.each(['before', 'after', 'late_purchase', 'unknown_start', 'unknown_prediction'] as const)(
    '厳密な時系列検証: %s', (kind) => {
      const source = makeDashboardSource()
      const race = source.races[0]!
      if (kind === 'after' || kind === 'late_purchase') {
        race.predictionVersions[0]!.confirmedAt = '2026-11-02T07:00:00+09:00'
      }
      if (kind === 'late_purchase') race.purchases[0]!.placedAt = '2026-11-03T09:00:00+09:00'
      if (kind === 'unknown_start') delete race.raceStartEvidence
      if (kind === 'unknown_prediction') race.predictionVersions[0]!.confirmedAt = ''
      const calibration = analyzeDashboard(source).calibration
      expect(calibration.sampleCount).toBe(kind === 'before' ? 1 : 0)
      if (kind !== 'before') expect(calibration.brierScore).toBeNull()
    },
  )

  it('券種・プラン抽出は照合対象外、結果状態はレース全体として照合する', () => {
    const source = makeDashboardSource()
    expect(analyzeDashboard(source, { ...emptyDashboardFilters, betType: 'win' }).ledger.status).toBe('excluded')
    expect(analyzeDashboard(source, { ...emptyDashboardFilters, plan: 'with_plan' }).ledger.status).toBe('excluded')
    expect(analyzeDashboard(source, { ...emptyDashboardFilters, result: 'confirmed' }).ledger.status).toBe('matched')
    expect(analyzeDashboard({ ...source, syncPending: true }).ledger.status).toBe('syncing')
  })

  it('購入1件の的中、払戻、損益、回収率を集計する', () => {
    const result = analyzeDashboard(makeDashboardSource(), emptyDashboardFilters)
    expect(result.kpi).toMatchObject({
      hitCount: 1,
      netProfitYen: 200,
      payoutYen: 300,
      returnRatePercent: 300,
      stakeYen: 100,
      ticketCount: 1,
    })
  })

  it.each([
    ['miss', -100, 0, 1, 0],
    ['refund', 0, 0, 0, 1],
    ['unresolved', -100, 1, 0, 0],
  ] as const)('%sを的中と混同しない', (outcome, net, unresolved, miss, refund) => {
    const result = analyzeDashboard(makeDashboardSource({ outcome }), emptyDashboardFilters)
    expect(result.kpi.netProfitYen).toBe(net)
    expect(result.kpi.unresolvedCount).toBe(unresolved)
    expect(result.kpi.missCount).toBe(miss)
    expect(result.kpi.refundCount).toBe(refund)
  })

  it('同じ買い目の複数購入は実績件数に数える', () => {
    const left = makeDashboardSource({ raceId: '2026-11-01-TOKYO-01-JRA' })
    const right = makeDashboardSource({ raceId: '2026-11-02-TOKYO-02-JRA' })
    expect(analyzeDashboard(mergeDashboardSources(left, right)).kpi.ticketCount).toBe(2)
  })

  it('購入訂正はrootPurchaseIdの最新版だけを集計する', () => {
    const source = makeDashboardSource()
    const race = source.races[0]!
    const original = race.purchases[0]!
    const corrected = {
      ...original,
      correctionOf: original.purchaseId,
      correctionSequence: 1,
      items: [{ ...original.items[0]!, itemId: 'corrected-item', stakeYen: 500 }],
      purchaseId: `${original.purchaseId}-c1`,
      status: 'corrected' as const,
      totalStakeYen: 500,
    }
    race.purchases.push(corrected)
    race.race.activePurchaseIds = [corrected.purchaseId]
    race.race.latestPurchaseId = corrected.purchaseId
    source.ledgerTransactions[0]!.amountYen = 1000
    const result = analyzeDashboard(source)
    expect(result.kpi.stakeYen).toBe(500)
    expect(result.kpi.payoutYen).toBe(1500)
  })

  it('結果訂正は最新の結果だけを使う', () => {
    const source = makeDashboardSource()
    const race = source.races[0]!
    const original = race.results[0]!
    const corrected = {
      ...original,
      correctionOf: original.resultId,
      correctionSequence: 1,
      payload: {
        ...original.payload,
        payouts: [{ ...original.payload.payouts[0]!, payout_per_100_yen: 500 }],
        result_status: 'corrected' as const,
      },
      resultId: `${original.resultId}-c1`,
      status: 'corrected' as const,
    }
    race.results.push(corrected)
    race.race.latestResultId = corrected.resultId
    source.ledgerTransactions[0]!.amountYen = 400
    expect(analyzeDashboard(source).kpi.payoutYen).toBe(500)
  })

  it('結果確定後の追加購入も別の有効購入として集計する', () => {
    const source = makeDashboardSource()
    const race = source.races[0]!
    const first = race.purchases[0]!
    const late = {
      ...first,
      items: [{ ...first.items[0]!, itemId: 'late-item' }],
      purchaseId: `${first.purchaseId}-late`,
      rootPurchaseId: `${first.rootPurchaseId}-late`,
    }
    race.purchases.push(late)
    race.race.activePurchaseIds = [first.purchaseId, late.purchaseId]
    source.ledgerTransactions[0]!.amountYen = 400
    const result = analyzeDashboard(source)
    expect(result.kpi.ticketCount).toBe(2)
    expect(result.kpi.netProfitYen).toBe(400)
  })

  it('台帳と有効購入・最新結果の現金収支を照合する', () => {
    const result = analyzeDashboard(makeDashboardSource())
    expect(result.ledger).toMatchObject({ differenceYen: 0, matches: true })
    const mismatched = analyzeDashboard(makeDashboardSource({ ledgerAmountYen: 999 }))
    expect(mismatched.ledger.matches).toBe(false)
  })

  it('全8券種の集計行を常に返す', () => {
    const sources = dashboardBetTypes.map((betType, index) =>
      makeDashboardSource({
        betType,
        candidateId: `candidate-${index}`,
        raceId: `2026-11-${String(index + 1).padStart(2, '0')}-TOKYO-${index + 1}-JRA`,
        selections: betType === 'trio' || betType === 'trifecta' ? [1, 2, 3] : betType === 'win' || betType === 'place' ? [1] : [1, 2],
      }),
    )
    const result = analyzeDashboard(mergeDashboardSources(...sources))
    expect(result.betTypeStats).toHaveLength(8)
    expect(result.betTypeStats.every((entry) => entry.ticketCount === 1)).toBe(true)
  })

  it('JRA・NAR、競馬場、期間のフィルターを全指標へ適用する', () => {
    const source = mergeDashboardSources(
      makeDashboardSource({ date: '2026-10-01', organizer: 'JRA', raceId: '2026-10-01-TOKYO-01-JRA', venueCode: 'TOKYO' }),
      makeDashboardSource({ date: '2026-11-01', organizer: 'NAR', raceId: '2026-11-01-OI-01-NAR', venueCode: 'OI' }),
    )
    const result = analyzeDashboard(source, {
      ...emptyDashboardFilters,
      dateFrom: '2026-11-01',
      organizer: 'NAR',
      venueCode: 'OI',
    })
    expect(result.kpi.ticketCount).toBe(1)
    expect(result.organizerStats[0]?.key).toBe('NAR')
  })

  it('確率帯、Brier Scoreを計算し同一候補の重複を除外する', () => {
    const source = makeDashboardSource({ probability: 0.8 })
    const rows = analyzeDashboard(source).filteredRows
    const duplicated = [{ ...rows[0]! }, { ...rows[0]!, itemId: 'duplicate' }]
    const result = calculateCalibration(duplicated)
    expect(result.sampleCount).toBe(1)
    expect(result.duplicateCandidateCount).toBe(1)
    expect(result.brierScore).toBeCloseTo(0.04)
    expect(result.bands[4]?.count).toBe(1)
  })

  it('返還・未判定・確率なしは較正対象にしない', () => {
    const source = mergeDashboardSources(
      makeDashboardSource({ outcome: 'refund', probability: 0.5, raceId: '2026-11-01-TOKYO-01-JRA' }),
      makeDashboardSource({ outcome: 'unresolved', probability: 0.5, raceId: '2026-11-02-TOKYO-02-JRA' }),
      makeDashboardSource({ outcome: 'hit', probability: null, raceId: '2026-11-03-TOKYO-03-JRA' }),
    )
    expect(analyzeDashboard(source).calibration.sampleCount).toBe(0)
  })

  it('購入後に作成された参照スナップショットを期待値・精度評価から除外する', () => {
    const source = makeDashboardSource()
    source.races[0]!.plans[0]!.createdAt = '2026-11-01T12:00:00+09:00'
    const result = analyzeDashboard(source)
    expect(result.kpi.expectedNetProfitYen).toBeNull()
    expect(result.calibration.sampleCount).toBe(0)
    expect(result.calibration.excludedChronologyCount).toBe(1)
  })

  it('購入額0とレース0件でゼロ除算せず未算出を返す', () => {
    const empty = analyzeDashboard({ ledgerTransactions: [], races: [], truncated: false })
    expect(empty.kpi.returnRatePercent).toBeNull()
    expect(empty.kpi.hitRatePercent).toBeNull()
    expect(empty.calibration.brierScore).toBeNull()
  })

  it('日・週・月の累積収支をレース日基準で生成する', () => {
    const source = mergeDashboardSources(
      makeDashboardSource({ date: '2026-11-01', raceId: '2026-11-01-TOKYO-01-JRA' }),
      makeDashboardSource({ date: '2026-11-08', outcome: 'miss', raceId: '2026-11-08-TOKYO-01-JRA' }),
    )
    const rows = analyzeDashboard(source).filteredRows
    expect(buildTimeSeries(rows, 'daily')).toHaveLength(2)
    expect(buildTimeSeries(rows, 'weekly')).toHaveLength(2)
    expect(buildTimeSeries(rows, 'monthly')).toHaveLength(1)
  })

  it('購入プラン有無と結果状態のフィルターを適用する', () => {
    const source = mergeDashboardSources(
      makeDashboardSource({ includePlan: true, raceId: '2026-11-01-TOKYO-01-JRA' }),
      makeDashboardSource({ includePlan: false, outcome: 'unresolved', raceId: '2026-11-02-TOKYO-02-JRA' }),
    )
    expect(analyzeDashboard(source, { ...emptyDashboardFilters, plan: 'without_plan' }).kpi.ticketCount).toBe(1)
    expect(analyzeDashboard(source, { ...emptyDashboardFilters, result: 'confirmed' }).kpi.ticketCount).toBe(1)
  })

  it('複数シナリオから実際の展開へ割り当てた確率を合算する', () => {
    const result = analyzeDashboard(makeDashboardSource())
    expect(result.scenarioReviews[0]?.matchingProbability).toBeCloseTo(0.6)
    expect(result.scenarioReviews[0]?.observedPace).toBe('slow')
  })
})
