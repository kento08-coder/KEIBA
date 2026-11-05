import type { PredictionDocument } from './import'
import type { PurchasePlanSnapshot } from './purchase-plan'
import type {
  BankrollTransactionRecord as SettlementBankrollTransactionRecord,
  PurchaseRecord as SettlementPurchaseRecord,
  ResultRecordSnapshot,
} from './settlement'

export type IsoDateTimeString = string
export type RaceStatus =
  | 'registered'
  | 'predicting'
  | 'prediction_confirmed'
  | 'purchased'
  | 'result_recorded'

export interface RaceRecord<TTimestamp = IsoDateTimeString> {
  activePurchaseIds?: string[]
  createdAt: TTimestamp
  date: string
  distanceM: number
  latestPredictionVersionId: string | null
  latestPurchaseId?: string | null
  latestResultId?: string | null
  name: string
  organizer: string
  purchaseRevision?: number
  raceId: string
  raceNumber: number
  resultStatus: 'none' | 'draft' | 'confirmed'
  status: RaceStatus
  surface: string
  updatedAt: TTimestamp
  venueCode: string
}

export interface PredictionDraftRecord<TTimestamp = IsoDateTimeString> {
  baseVersionId: string | null
  lastEditedAt: TTimestamp
  lastEditedByClient: string
  payload: PredictionDocument
  revision: number
  schemaVersion: '1.0.0'
}

export interface PredictionVersionRecord<TTimestamp = IsoDateTimeString> {
  authorUid: string
  changeReason: string
  confirmedAt: TTimestamp
  contentHash: string
  createdAt: TTimestamp
  parentVersionId: string | null
  schemaVersion: '1.0.0'
  snapshot: PredictionDocument
  status: 'final'
  versionNumber: number
}

export type PurchaseRecord<TTimestamp = IsoDateTimeString> =
  SettlementPurchaseRecord<TTimestamp>

export type ResultRecord<TTimestamp = IsoDateTimeString> =
  ResultRecordSnapshot<TTimestamp>

export type BankrollTransactionRecord<TTimestamp = IsoDateTimeString> =
  SettlementBankrollTransactionRecord<TTimestamp>

export interface ImportLogRecord<TTimestamp = IsoDateTimeString> {
  contentHash: string
  documentType: 'prediction' | 'result'
  importedAt: TTimestamp
  raceId: string
  schemaVersion: '1.0.0'
  sourceFileName: string | null
  targetId: string
}

export type PurchasePlanRecord<TTimestamp = IsoDateTimeString> =
  PurchasePlanSnapshot<TTimestamp>
