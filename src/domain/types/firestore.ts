import type { PredictionDocument, ResultDocument } from './import'
import type { PurchasePlanSnapshot } from './purchase-plan'

export type IsoDateTimeString = string
export type RaceStatus =
  | 'registered'
  | 'predicting'
  | 'prediction_confirmed'
  | 'purchased'
  | 'result_recorded'

export interface RaceRecord<TTimestamp = IsoDateTimeString> {
  createdAt: TTimestamp
  date: string
  distanceM: number
  latestPredictionVersionId: string | null
  name: string
  organizer: string
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

export interface ResultRecord<TTimestamp = IsoDateTimeString> {
  contentHash: string
  createdAt: TTimestamp
  importId: string
  payload: ResultDocument
  status: 'draft' | 'confirmed' | 'corrected'
  updatedAt: TTimestamp
}

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
