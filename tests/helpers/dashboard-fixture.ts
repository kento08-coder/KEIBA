import type { DashboardSource } from '../../src/domain/types/dashboard'
import type {
  BankrollTransactionRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  PurchaseRecord,
  RaceRecord,
  ResultRecord,
} from '../../src/domain/types/firestore'
import type { BetType, PredictionDocument, ResultDocument } from '../../src/domain/types/import'

export interface DashboardFixtureOptions {
  betType?: BetType
  candidateId?: string
  date?: string
  includePlan?: boolean
  ledgerAmountYen?: number
  odds?: number | null
  organizer?: string
  outcome?: 'hit' | 'miss' | 'refund' | 'unresolved'
  probability?: number | null
  raceId?: string
  selections?: number[]
  stakeYen?: number
  venueCode?: string
}

export function makeDashboardSource(
  options: DashboardFixtureOptions = {},
): DashboardSource<string> {
  const raceId = options.raceId ?? '2026-11-01-TOKYO-11-JRA'
  const betType = options.betType ?? 'win'
  const candidateId = options.candidateId ?? 'candidate-1'
  const selections = options.selections ?? [1]
  const stakeYen = options.stakeYen ?? 100
  const probability = options.probability === undefined ? 0.5 : options.probability
  const odds = options.odds === undefined ? 3 : options.odds
  const outcome = options.outcome ?? 'hit'
  const includePlan =
    options.includePlan ?? (probability !== null && odds !== null)
  const date = options.date ?? '2026-11-01'
  const purchaseId = `${raceId}-purchase-1`
  const resultId = `${raceId}-result-1`
  const versionId = `${raceId}-prediction-v1`
  const planId = `${raceId}-plan-1`
  const returnYen = outcome === 'hit' ? 300 : outcome === 'refund' ? stakeYen : 0

  const prediction = {
    bet_candidates: [{
      bet_type: betType,
      confidence: 'medium',
      hit_probability: probability,
      horse_numbers: selections,
      id: candidateId,
      odds,
      odds_observed_at: odds === null ? null : `${date}T08:00:00+09:00`,
      probability_source: probability === null ? 'unset' : 'user_estimate',
      rationale: 'fixture',
    }],
    scenarios: [
      { id: 'slow', label: 'スロー', pace: 'slow', probability: 0.6 },
      { id: 'high', label: 'ハイ', pace: 'high', probability: 0.4 },
    ],
  } as unknown as PredictionDocument
  const version: PredictionVersionRecord<string> & { id: string } = {
    authorUid: 'user-1',
    changeReason: 'fixture',
    confirmedAt: `${date}T07:00:00+09:00`,
    contentHash: 'a'.repeat(64),
    createdAt: `${date}T07:00:00+09:00`,
    id: versionId,
    parentVersionId: null,
    schemaVersion: '1.0.0',
    snapshot: prediction,
    status: 'final',
    versionNumber: 1,
  }
  const purchase: PurchaseRecord<string> = {
    authorUid: 'user-1',
    confirmedAt: `${date}T09:00:00+09:00`,
    correctionOf: null,
    correctionSequence: 0,
    createdAt: `${date}T09:00:00+09:00`,
    idempotencyKey: `stake-${purchaseId}`,
    items: [{
      betType,
      itemId: `${purchaseId}-item-1`,
      purchaseOdds: odds,
      selections,
      sourceCandidateId: candidateId,
      stakeYen,
    }],
    memo: '',
    placedAt: `${date}T09:00:00+09:00`,
    purchaseId,
    raceId,
    recordedAt: `${date}T09:00:00+09:00`,
    revision: 1,
    rootPurchaseId: purchaseId,
    sourcePlanId: includePlan ? planId : null,
    sourcePredictionVersionId: versionId,
    status: 'confirmed',
    totalStakeYen: stakeYen,
    updatedAt: `${date}T09:00:00+09:00`,
  }
  const payoutSelections = outcome === 'miss' ? selections.map((value) => value + 1) : selections
  const resultDocument = {
    observed_pace: { label: 'slow', verified: true },
    payouts: outcome === 'unresolved' ? [] : [{
      bet_type: betType,
      horse_numbers: payoutSelections,
      official_confirmed: true,
      payout_per_100_yen: outcome === 'refund' ? 100 : 300,
      payout_type: outcome === 'refund' ? 'refund' : 'payout',
    }],
    result_status: 'confirmed',
  } as unknown as ResultDocument
  const result: ResultRecord<string> = {
    activePurchaseIds: [purchaseId],
    authorUid: 'user-1',
    confirmedAt: `${date}T17:00:00+09:00`,
    contentHash: 'b'.repeat(64),
    correctionOf: null,
    correctionSequence: 0,
    createdAt: `${date}T17:00:00+09:00`,
    idempotencyKey: `result-${resultId}`,
    importId: `import-${resultId}`,
    payload: resultDocument,
    purchaseRevision: 1,
    raceId,
    resultId,
    rootResultId: resultId,
    status: 'confirmed',
    updatedAt: `${date}T17:00:00+09:00`,
  }
  const race: RaceRecord<string> = {
    activePurchaseIds: [purchaseId],
    createdAt: `${date}T06:00:00+09:00`,
    date,
    distanceM: 1600,
    latestPredictionVersionId: versionId,
    latestPurchaseId: purchaseId,
    latestResultId: outcome === 'unresolved' ? null : resultId,
    name: `Fixture ${raceId}`,
    organizer: options.organizer ?? 'JRA',
    purchaseRevision: 1,
    raceId,
    raceNumber: 11,
    resultStatus: outcome === 'unresolved' ? 'none' : 'confirmed',
    status: outcome === 'unresolved' ? 'purchased' : 'result_recorded',
    surface: 'turf',
    updatedAt: `${date}T17:00:00+09:00`,
    venueCode: options.venueCode ?? 'TOKYO',
  }
  const plan: PurchasePlanRecord<string> = {
    algorithmVersion: 'phase1-m4-v1',
    allocations: [{ candidateId, expectedNetProfitYen: 50, expectedPayoutYen: 150, expectedReturnRatePercent: 150, referenceKellyFraction: null, stakeYen }],
    assumptions: [],
    authorUid: 'user-1',
    budgetYen: stakeYen,
    candidateSnapshot: [{
      betType,
      candidateId,
      confidence: 'medium',
      hitProbability: probability ?? 0,
      odds: odds ?? 1,
      oddsObservedAt: `${date}T08:00:00+09:00`,
      probabilitySource: probability === null ? 'unset' : 'user_estimate',
      rationale: 'fixture',
      selections,
    }],
    createdAt: `${date}T08:30:00+09:00`,
    isSimulation: true,
    memo: '',
    name: 'fixture',
    planId,
    settings: { betTypeMode: 'auto', budgetYen: stakeYen, kellyFraction: 0.25, lossControlBudgetFraction: 0.3, maxSelections: 1, maxStakePerBetYen: stakeYen, selectedBetTypes: [] },
    sourcePredictionVersionId: versionId,
    strategy: 'expected_value',
    summary: { expectedNetProfitYen: 50, expectedPayoutYen: 150, expectedReturnRatePercent: 150, totalStakeYen: stakeYen, unusedBudgetYen: 0, worstCaseLossYen: stakeYen },
    warnings: [],
  }
  const ledgerAmountYen = options.ledgerAmountYen ?? returnYen - stakeYen
  const ledger: BankrollTransactionRecord<string> = {
    amountYen: ledgerAmountYen,
    at: `${date}T17:00:00+09:00`,
    authorUid: 'user-1',
    idempotencyKey: `ledger-${raceId}`,
    kind: ledgerAmountYen < 0 ? 'stake' : 'payout',
    note: 'fixture net transaction',
    raceId,
    referenceId: purchaseId,
    transactionId: `ledger-${raceId}`,
  }
  return {
    ledgerTransactions: [ledger],
    races: [{
      plans: includePlan ? [plan] : [],
      predictionVersions: [version],
      purchases: [purchase],
      race,
      results: outcome === 'unresolved' ? [] : [result],
    }],
    truncated: false,
  }
}

export function mergeDashboardSources(...sources: Array<DashboardSource<string>>): DashboardSource<string> {
  return {
    ledgerTransactions: sources.flatMap((source) => source.ledgerTransactions),
    races: sources.flatMap((source) => source.races),
    truncated: sources.some((source) => source.truncated),
  }
}
