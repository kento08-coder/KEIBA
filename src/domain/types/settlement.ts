import type { BetType, ResultDocument } from './import'

export type PurchaseStatus = 'draft' | 'confirmed' | 'corrected'

export interface PurchaseItem {
  betType: BetType
  itemId: string
  purchaseOdds: number | null
  selections: number[]
  sourceCandidateId: string | null
  stakeYen: number
}

export interface PurchaseRecord<TTimestamp = string> {
  authorUid: string
  confirmedAt: TTimestamp | null
  correctionOf: string | null
  correctionSequence: number
  createdAt: TTimestamp
  idempotencyKey: string
  items: PurchaseItem[]
  memo: string
  placedAt: string
  purchaseId: string
  raceId: string
  recordedAt: TTimestamp
  revision: number
  rootPurchaseId: string
  sourcePlanId: string | null
  sourcePredictionVersionId: string | null
  status: PurchaseStatus
  totalStakeYen: number
  updatedAt: TTimestamp
}

export interface ResultRecordSnapshot<TTimestamp = string> {
  authorUid: string
  confirmedAt: TTimestamp | null
  contentHash: string
  correctionOf: string | null
  correctionSequence: number
  createdAt: TTimestamp
  idempotencyKey: string
  importId: string
  payload: ResultDocument
  raceId: string
  resultId: string
  rootResultId: string
  status: 'draft' | 'confirmed' | 'corrected'
  updatedAt: TTimestamp
}

export interface BankrollTransactionRecord<TTimestamp = string> {
  amountYen: number
  at: TTimestamp
  authorUid: string
  idempotencyKey: string
  kind: 'stake' | 'payout' | 'adjustment'
  note: string
  raceId: string
  referenceId: string
  transactionId: string
}

export type SettlementStatus = 'hit' | 'miss' | 'refund' | 'unresolved'

export type SettlementUnresolvedReason =
  | 'result_missing'
  | 'result_unconfirmed'
  | 'payout_table_incomplete'
  | 'conflicting_official_records'

export interface TicketSettlement {
  itemId: string
  netProfitYen: number | null
  payoutYen: number
  refundYen: number
  returnRatePercent: number | null
  returnedYen: number | null
  stakeYen: number
  status: SettlementStatus
  unresolvedReason: SettlementUnresolvedReason | null
}

export interface PurchaseSettlement {
  items: TicketSettlement[]
  purchaseId: string
  totalNetProfitYen: number | null
  totalPayoutYen: number
  totalRefundYen: number
  totalReturnedYen: number | null
  totalStakeYen: number
}

export interface RaceSettlementSummary {
  activePurchaseCount: number
  itemCount: number
  netProfitYen: number | null
  payoutYen: number
  refundYen: number
  resolvedItemCount: number
  returnRatePercent: number | null
  returnedYen: number
  stakeYen: number
  unresolvedItemCount: number
}
