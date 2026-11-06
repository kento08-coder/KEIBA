import type {
  BankrollTransactionRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  PurchaseRecord,
  RaceRecord,
  ResultRecord,
} from './firestore'
import type { BetType } from './import'
import type { SettlementStatus } from './settlement'

export const dashboardBetTypes: BetType[] = [
  'win',
  'place',
  'bracket_quinella',
  'quinella',
  'wide',
  'exacta',
  'trio',
  'trifecta',
]

export interface DashboardRaceSource<TTimestamp = unknown> {
  plans: Array<PurchasePlanRecord<TTimestamp>>
  predictionVersions: Array<PredictionVersionRecord<TTimestamp> & { id: string }>
  purchases: Array<PurchaseRecord<TTimestamp>>
  race: RaceRecord<TTimestamp>
  results: Array<ResultRecord<TTimestamp>>
}

export interface DashboardSource<TTimestamp = unknown> {
  ledgerTransactions: Array<BankrollTransactionRecord<TTimestamp>>
  races: Array<DashboardRaceSource<TTimestamp>>
  truncated: boolean
}

export type DashboardResultFilter = 'all' | 'confirmed' | 'unconfirmed'
export type DashboardPlanFilter = 'all' | 'with_plan' | 'without_plan'
export type DashboardPeriod = 'daily' | 'weekly' | 'monthly'

export interface DashboardFilters {
  betType: BetType | 'all'
  dateFrom: string
  dateTo: string
  organizer: string
  plan: DashboardPlanFilter
  result: DashboardResultFilter
  venueCode: string
}

export interface DashboardTicketRow {
  betType: BetType
  candidateId: string | null
  confidence: string | null
  expectedNetProfitYen: number | null
  expectedReturnRatePercent: number | null
  hitProbability: number | null
  itemId: string
  netProfitYen: number
  odds: number | null
  oddsObservedAt: string | null
  organizer: string
  payoutYen: number
  planId: string | null
  predictionKey: string | null
  predictionWasPreRace: boolean
  probabilitySource: string | null
  purchaseId: string
  raceDate: string
  raceId: string
  raceName: string
  refundYen: number
  resultConfirmed: boolean
  selections: number[]
  settlementStatus: SettlementStatus
  stakeYen: number
  venueCode: string
}

export interface DashboardKpi {
  averageExpectedReturnRatePercent: number | null
  averageStakeYen: number | null
  expectedNetProfitYen: number | null
  hitCount: number
  hitRatePercent: number | null
  missCount: number
  netProfitYen: number
  payoutYen: number
  provisional: boolean
  purchasedRaceCount: number
  refundCount: number
  refundYen: number
  returnRatePercent: number | null
  stakeYen: number
  ticketCount: number
  unresolvedCount: number
}

export interface DashboardGroupStat {
  averageOdds: number | null
  hitCount: number
  hitRatePercent: number | null
  key: string
  label: string
  missCount: number
  netProfitYen: number
  payoutYen: number
  refundYen: number
  returnRatePercent: number | null
  stakeYen: number
  ticketCount: number
  unresolvedCount: number
}

export interface DashboardTimePoint {
  cumulativeNetProfitYen: number
  key: string
  label: string
  netProfitYen: number
  provisional: boolean
}

export interface CalibrationBand {
  actualHitRate: number | null
  averageProbability: number | null
  count: number
  difference: number | null
  label: string
  lower: number
  upper: number
}

export interface CalibrationSummary {
  bands: CalibrationBand[]
  brierScore: number | null
  duplicateCandidateCount: number
  excludedChronologyCount: number
  sampleCount: number
}

export interface ScenarioReview {
  matchingProbability: number
  observedPace: string
  predictionVersionId: string
  raceId: string
  raceName: string
}

export interface LedgerReconciliation {
  comparable: boolean
  derivedNetCashYen: number
  differenceYen: number
  ledgerNetCashYen: number
  matches: boolean
  transactionCount: number
}

export interface DashboardAnalysis {
  betTypeStats: DashboardGroupStat[]
  calibration: CalibrationSummary
  filteredRows: DashboardTicketRow[]
  kpi: DashboardKpi
  ledger: LedgerReconciliation
  organizerStats: DashboardGroupStat[]
  scenarioReviews: ScenarioReview[]
  timeSeries: Record<DashboardPeriod, DashboardTimePoint[]>
  venueStats: DashboardGroupStat[]
}
