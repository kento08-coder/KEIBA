import { calculateExpectedValue, betTypeLabels } from './expected-value'
import {
  selectEffectivePurchases,
  selectEffectiveResult,
  settlePurchaseItem,
} from './settlement'
import type {
  CalibrationBand,
  DashboardAnalysis,
  DashboardFilters,
  DashboardGroupStat,
  DashboardPeriod,
  DashboardRaceSource,
  DashboardSource,
  DashboardTicketRow,
  DashboardTimePoint,
  ScenarioReview,
} from '../types/dashboard'
import { dashboardBetTypes } from '../types/dashboard'
import type { BetType } from '../types/import'

export const emptyDashboardFilters: DashboardFilters = {
  betType: 'all',
  dateFrom: '',
  dateTo: '',
  organizer: 'all',
  plan: 'all',
  result: 'all',
  venueCode: 'all',
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const method = (value as { toMillis?: unknown }).toMillis
    if (typeof method === 'function') {
      const result = method.call(value)
      return typeof result === 'number' && Number.isFinite(result) ? result : null
    }
  }
  return null
}

function sourceSnapshot(
  source: DashboardRaceSource,
  purchase: DashboardRaceSource['purchases'][number],
  candidateId: string | null,
) {
  if (!candidateId) return null
  if (purchase.sourcePlanId) {
    const plan = source.plans.find((entry) => entry.planId === purchase.sourcePlanId)
    const candidate = plan?.candidateSnapshot.find(
      (entry) => entry.candidateId === candidateId,
    )
    if (candidate) {
      return {
        confidence: candidate.confidence,
        hitProbability: candidate.hitProbability,
        odds: candidate.odds,
        oddsObservedAt: candidate.oddsObservedAt,
        probabilitySource: candidate.probabilitySource,
        referenceAt: plan!.createdAt,
      }
    }
  }
  if (!purchase.sourcePredictionVersionId) return null
  const version = source.predictionVersions.find(
    (entry) => entry.id === purchase.sourcePredictionVersionId,
  )
  const candidate = version?.snapshot.bet_candidates.find(
    (entry) => entry.id === candidateId,
  )
  return candidate
    ? {
        confidence: candidate.confidence,
        hitProbability: candidate.hit_probability,
        odds: candidate.odds,
        oddsObservedAt: candidate.odds_observed_at,
        probabilitySource: candidate.probability_source,
        referenceAt: version!.confirmedAt,
      }
    : null
}

function latestResult(source: DashboardRaceSource) {
  const referenced = source.race.latestResultId
    ? source.results.find((entry) => entry.resultId === source.race.latestResultId)
    : null
  return referenced && referenced.status !== 'draft'
    ? referenced
    : selectEffectiveResult(source.results)
}

export function isStrictPreRacePrediction(source: DashboardRaceSource, confirmedAt: unknown) {
  const evidence = source.raceStartEvidence
  const start = evidence?.verified && /^https:\/\//.test(evidence.sourceUrl)
    ? toMillis(evidence.actualStartedAt)
    : null
  const confirmed = toMillis(confirmedAt)
  // A purchase time or an app result-save time cannot prove the actual race start.
  return start !== null && confirmed !== null && confirmed < start
}

function buildRows(source: DashboardRaceSource): DashboardTicketRow[] {
  const result = latestResult(source)
  const activeIds = new Set(source.race.activePurchaseIds ?? [])
  const selected = selectEffectivePurchases(source.purchases)
  const purchases = Array.isArray(source.race.activePurchaseIds)
    ? selected.filter((purchase) => activeIds.has(purchase.purchaseId))
    : selected

  return purchases.flatMap((purchase) =>
    purchase.items.map((item) => {
      const settlement = settlePurchaseItem(item, result?.payload ?? null)
      const snapshot = sourceSnapshot(source, purchase, item.sourceCandidateId)
      const confirmedAt = toMillis(snapshot?.referenceAt)
      const placedAt = toMillis(purchase.placedAt)
      const version = source.predictionVersions.find(
        (entry) => entry.id === purchase.sourcePredictionVersionId,
      )
      const predictionWasPreRace =
        isStrictPreRacePrediction(source, version?.confirmedAt) &&
        isStrictPreRacePrediction(source, snapshot?.referenceAt) &&
        confirmedAt !== null && placedAt !== null && confirmedAt <= placedAt
      const snapshotPredatesPurchase =
        confirmedAt !== null && placedAt !== null && confirmedAt <= placedAt
      const evaluation = calculateExpectedValue({
        odds: snapshotPredatesPurchase ? (snapshot?.odds ?? null) : null,
        oddsObserved: snapshotPredatesPurchase && Boolean(snapshot?.oddsObservedAt),
        probability: snapshotPredatesPurchase ? (snapshot?.hitProbability ?? null) : null,
        stakeYen: item.stakeYen,
      })
      return {
        betType: item.betType,
        candidateId: item.sourceCandidateId,
        confidence: snapshot?.confidence ?? null,
        expectedNetProfitYen:
          evaluation.status === 'calculated'
            ? evaluation.metrics.expectedNetProfitYen
            : null,
        expectedReturnRatePercent:
          evaluation.status === 'calculated'
            ? evaluation.metrics.expectedReturnRatePercent
            : null,
        hitProbability: snapshot?.hitProbability ?? null,
        itemId: item.itemId,
        netProfitYen: settlement.payoutYen + settlement.refundYen - item.stakeYen,
        odds: snapshot?.odds ?? null,
        oddsObservedAt: snapshot?.oddsObservedAt ?? null,
        organizer: source.race.organizer,
        payoutYen: settlement.payoutYen,
        planId: purchase.sourcePlanId,
        predictionKey:
          purchase.sourcePredictionVersionId && item.sourceCandidateId
            ? `${source.race.raceId}:${purchase.sourcePredictionVersionId}:${item.sourceCandidateId}`
            : null,
        predictionWasPreRace,
        probabilitySource: snapshot?.probabilitySource ?? null,
        purchaseId: purchase.purchaseId,
        raceDate: source.race.date,
        raceId: source.race.raceId,
        raceName: source.race.name,
        refundYen: settlement.refundYen,
        resultConfirmed: Boolean(result),
        selections: [...item.selections],
        settlementStatus: settlement.status,
        stakeYen: item.stakeYen,
        venueCode: source.race.venueCode,
      }
    }),
  )
}

export function filterDashboardRows(
  rows: DashboardTicketRow[],
  filters: DashboardFilters,
) {
  return rows.filter((row) => {
    if (filters.dateFrom && row.raceDate < filters.dateFrom) return false
    if (filters.dateTo && row.raceDate > filters.dateTo) return false
    if (filters.organizer !== 'all' && row.organizer !== filters.organizer) return false
    if (filters.venueCode !== 'all' && row.venueCode !== filters.venueCode) return false
    if (filters.betType !== 'all' && row.betType !== filters.betType) return false
    if (filters.plan === 'with_plan' && !row.planId) return false
    if (filters.plan === 'without_plan' && row.planId) return false
    if (filters.result === 'confirmed' && !row.resultConfirmed) return false
    if (filters.result === 'unconfirmed' && row.resultConfirmed) return false
    return true
  })
}

function summarize(rows: DashboardTicketRow[]) {
  const stakeYen = rows.reduce((sum, row) => sum + row.stakeYen, 0)
  const payoutYen = rows.reduce((sum, row) => sum + row.payoutYen, 0)
  const refundYen = rows.reduce((sum, row) => sum + row.refundYen, 0)
  const hitCount = rows.filter((row) => row.settlementStatus === 'hit').length
  const missCount = rows.filter((row) => row.settlementStatus === 'miss').length
  const refundCount = rows.filter((row) => row.settlementStatus === 'refund').length
  const unresolvedCount = rows.filter(
    (row) => row.settlementStatus === 'unresolved',
  ).length
  const settledCount = hitCount + missCount
  return {
    hitCount,
    hitRatePercent: settledCount > 0 ? (hitCount / settledCount) * 100 : null,
    missCount,
    netProfitYen: payoutYen + refundYen - stakeYen,
    payoutYen,
    refundCount,
    refundYen,
    returnRatePercent:
      stakeYen > 0 ? ((payoutYen + refundYen) / stakeYen) * 100 : null,
    stakeYen,
    ticketCount: rows.length,
    unresolvedCount,
  }
}

function groupStats(
  rows: DashboardTicketRow[],
  groups: Array<{ key: string; label: string }>,
  getKey: (row: DashboardTicketRow) => string,
): DashboardGroupStat[] {
  return groups.map((group) => {
    const matched = rows.filter((row) => getKey(row) === group.key)
    const summary = summarize(matched)
    const odds = matched.flatMap((row) => (row.odds === null ? [] : [row.odds]))
    return {
      ...summary,
      averageOdds:
        odds.length > 0 ? odds.reduce((sum, value) => sum + value, 0) / odds.length : null,
      key: group.key,
      label: group.label,
    }
  })
}

function bucketKey(date: string, period: DashboardPeriod) {
  if (period === 'monthly') return date.slice(0, 7)
  if (period === 'daily') return date
  const value = new Date(`${date}T00:00:00Z`)
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() - day + 1)
  return value.toISOString().slice(0, 10)
}

export function buildTimeSeries(
  rows: DashboardTicketRow[],
  period: DashboardPeriod,
): DashboardTimePoint[] {
  const buckets = new Map<string, { net: number; provisional: boolean }>()
  for (const row of rows) {
    const key = bucketKey(row.raceDate, period)
    const current = buckets.get(key) ?? { net: 0, provisional: false }
    current.net += row.netProfitYen
    current.provisional ||= row.settlementStatus === 'unresolved'
    buckets.set(key, current)
  }
  let cumulative = 0
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      cumulative += value.net
      return {
        cumulativeNetProfitYen: cumulative,
        key,
        label: period === 'monthly' ? key.replace('-', '/') : key,
        netProfitYen: value.net,
        provisional: value.provisional,
      }
    })
}

export function calculateCalibration(rows: DashboardTicketRow[]) {
  const usable = rows.filter(
    (row) =>
      (row.settlementStatus === 'hit' || row.settlementStatus === 'miss') &&
      row.hitProbability !== null &&
      row.predictionKey !== null,
  )
  const unique = new Map<string, DashboardTicketRow>()
  let duplicateCandidateCount = 0
  let excludedChronologyCount = 0
  for (const row of usable) {
    if (!row.predictionWasPreRace) {
      excludedChronologyCount += 1
      continue
    }
    if (unique.has(row.predictionKey!)) {
      duplicateCandidateCount += 1
      continue
    }
    unique.set(row.predictionKey!, row)
  }
  const samples = [...unique.values()]
  const definitions = [
    [0, 0.2, '0〜20%'],
    [0.2, 0.4, '20〜40%'],
    [0.4, 0.6, '40〜60%'],
    [0.6, 0.8, '60〜80%'],
    [0.8, 1, '80〜100%'],
  ] as const
  const bands: CalibrationBand[] = definitions.map(([lower, upper, label], index) => {
    const matched = samples.filter((row) => {
      const probability = row.hitProbability!
      return probability >= lower && (index === 4 ? probability <= upper : probability < upper)
    })
    const count = matched.length
    const averageProbability = count
      ? matched.reduce((sum, row) => sum + row.hitProbability!, 0) / count
      : null
    const actualHitRate = count
      ? matched.filter((row) => row.settlementStatus === 'hit').length / count
      : null
    return {
      actualHitRate,
      averageProbability,
      count,
      difference:
        averageProbability !== null && actualHitRate !== null
          ? actualHitRate - averageProbability
          : null,
      label,
      lower,
      upper,
    }
  })
  const brierScore = samples.length
    ? samples.reduce((sum, row) => {
        const actual = row.settlementStatus === 'hit' ? 1 : 0
        return sum + (row.hitProbability! - actual) ** 2
      }, 0) / samples.length
    : null
  return {
    bands,
    brierScore,
    duplicateCandidateCount,
    excludedChronologyCount,
    sampleCount: samples.length,
  }
}

function scenarioReviews(
  sources: DashboardRaceSource[],
  filteredRaceIds: Set<string>,
): ScenarioReview[] {
  return sources.flatMap((source) => {
    if (!filteredRaceIds.has(source.race.raceId)) return []
    const result = latestResult(source)
    if (
      !result ||
      !result.payload.observed_pace.verified ||
      result.payload.observed_pace.label === 'unknown'
    ) return []
    const activeIds = new Set(source.race.activePurchaseIds ?? [])
    const effectivePurchases = selectEffectivePurchases(source.purchases)
    const activePurchases = Array.isArray(source.race.activePurchaseIds)
      ? effectivePurchases.filter((purchase) => activeIds.has(purchase.purchaseId))
      : effectivePurchases
    const versionIds = new Set(
      activePurchases
        .map((purchase) => {
          const version = source.predictionVersions.find(
            (entry) => entry.id === purchase.sourcePredictionVersionId,
          )
          const confirmedAt = toMillis(version?.confirmedAt)
          return isStrictPreRacePrediction(source, confirmedAt === null ? null : version?.confirmedAt)
            ? purchase.sourcePredictionVersionId
            : null
        })
        .filter((value): value is string => Boolean(value)),
    )
    return source.predictionVersions.flatMap((version) => {
      if (!versionIds.has(version.id)) return []
      const matchingProbability = version.snapshot.scenarios
        .filter((scenario) => scenario.pace === result.payload.observed_pace.label)
        .reduce((sum, scenario) => sum + scenario.probability, 0)
      return [{
        matchingProbability,
        observedPace: result.payload.observed_pace.label,
        predictionVersionId: version.id,
        raceId: source.race.raceId,
        raceName: source.race.name,
      }]
    })
  })
}

export function analyzeDashboard(
  source: DashboardSource,
  filters: DashboardFilters = emptyDashboardFilters,
): DashboardAnalysis {
  const allRows = source.races.flatMap(buildRows)
  const rows = filterDashboardRows(allRows, filters)
  const summary = summarize(rows)
  const expectedRows = rows.filter(
    (row) => row.expectedReturnRatePercent !== null && row.expectedNetProfitYen !== null,
  )
  const organizers = [...new Set(rows.map((row) => row.organizer))]
    .sort()
    .map((key) => ({ key, label: key }))
  const venues = [...new Set(rows.map((row) => row.venueCode))]
    .sort()
    .map((key) => ({ key, label: key }))
  const filteredRaceIds = new Set(rows.map((row) => row.raceId))
  const ledgerTransactions = source.ledgerTransactions.filter((entry) =>
    filteredRaceIds.has(entry.raceId),
  )
  const ledgerNetCashYen = ledgerTransactions.reduce(
    (sum, entry) => sum + entry.amountYen,
    0,
  )
  const derivedNetCashYen = summary.netProfitYen
  const ledgerComparable =
    filters.betType === 'all' && filters.plan === 'all'
  return {
    betTypeStats: groupStats(
      rows,
      dashboardBetTypes.map((key) => ({ key, label: betTypeLabels[key] })),
      (row) => row.betType,
    ),
    calibration: calculateCalibration(rows),
    filteredRows: rows,
    kpi: {
      ...summary,
      averageExpectedReturnRatePercent: expectedRows.length
        ? expectedRows.reduce((sum, row) => sum + row.expectedReturnRatePercent!, 0) /
          expectedRows.length
        : null,
      averageStakeYen: rows.length ? summary.stakeYen / rows.length : null,
      expectedNetProfitYen: expectedRows.length
        ? expectedRows.reduce((sum, row) => sum + row.expectedNetProfitYen!, 0)
        : null,
      provisional: summary.unresolvedCount > 0,
      purchasedRaceCount: filteredRaceIds.size,
    },
    ledger: {
      status: !ledgerComparable ? 'excluded' : source.syncPending ? 'syncing' : ledgerNetCashYen === derivedNetCashYen ? 'matched' : 'difference',
      comparable: ledgerComparable,
      derivedNetCashYen,
      differenceYen: ledgerNetCashYen - derivedNetCashYen,
      ledgerNetCashYen,
      matches: ledgerComparable && ledgerNetCashYen === derivedNetCashYen,
      transactionCount: ledgerTransactions.length,
    },
    organizerStats: groupStats(rows, organizers, (row) => row.organizer),
    scenarioReviews: scenarioReviews(source.races, filteredRaceIds),
    timeSeries: {
      daily: buildTimeSeries(rows, 'daily'),
      monthly: buildTimeSeries(rows, 'monthly'),
      weekly: buildTimeSeries(rows, 'weekly'),
    },
    venueStats: groupStats(rows, venues, (row) => row.venueCode),
  }
}

export function availableDashboardOptions(source: DashboardSource) {
  return {
    organizers: [...new Set(source.races.map((entry) => entry.race.organizer))].sort(),
    venues: [...new Set(source.races.map((entry) => entry.race.venueCode))].sort(),
  }
}

export function betTypeFilterLabel(value: BetType | 'all') {
  return value === 'all' ? 'すべて' : betTypeLabels[value]
}
