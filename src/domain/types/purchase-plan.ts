import type { BetType } from './import'

export type PurchasePlanStrategy =
  | 'expected_value'
  | 'fractional_kelly'
  | 'loss_control'

export type BetTypeSelectionMode = 'auto' | 'manual'

export interface PurchasePlanSettings {
  betTypeMode: BetTypeSelectionMode
  budgetYen: number
  kellyFraction: number
  lossControlBudgetFraction: number
  maxSelections: number
  maxStakePerBetYen: number
  selectedBetTypes: BetType[]
}

export interface PlanCandidateSnapshot {
  betType: BetType
  candidateId: string
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  hitProbability: number
  odds: number
  oddsObservedAt: string
  probabilitySource: 'ai_estimate' | 'user_estimate' | 'model_estimate' | 'unset'
  rationale: string
  selections: number[]
}

export interface PurchasePlanAllocation {
  candidateId: string
  expectedNetProfitYen: number
  expectedPayoutYen: number
  expectedReturnRatePercent: number
  referenceKellyFraction: number | null
  stakeYen: number
}

export interface PurchasePlanSummary {
  expectedNetProfitYen: number
  expectedPayoutYen: number
  expectedReturnRatePercent: number | null
  totalStakeYen: number
  unusedBudgetYen: number
  worstCaseLossYen: number
}

export interface GeneratedPurchasePlan {
  allocations: PurchasePlanAllocation[]
  assumptions: string[]
  candidateSnapshot: PlanCandidateSnapshot[]
  name: string
  settings: PurchasePlanSettings
  skippedCandidateCount: number
  strategy: PurchasePlanStrategy
  summary: PurchasePlanSummary
  warnings: string[]
}

export interface PurchasePlanSnapshot<TTimestamp = string> {
  algorithmVersion: string
  allocations: PurchasePlanAllocation[]
  assumptions: string[]
  authorUid: string
  budgetYen: number
  candidateSnapshot: PlanCandidateSnapshot[]
  createdAt: TTimestamp
  isSimulation: true
  memo: string
  name: string
  planId: string
  settings: PurchasePlanSettings
  sourcePredictionVersionId: string
  strategy: PurchasePlanStrategy
  summary: PurchasePlanSummary
  warnings: string[]
}

export interface SelectionOverlap {
  leftCandidateId: string
  rightCandidateId: string
  sharedNumbers: number[]
  selectionKind: 'horse' | 'frame'
}
