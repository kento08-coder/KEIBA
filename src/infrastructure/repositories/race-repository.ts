import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  hashPredictionDocument,
  hasSamePredictionContent,
} from '../../domain/prediction-utils'
import {
  validatePurchasePlanWriteData,
  type PurchasePlanWriteData,
} from '../../domain/calculations/purchase-plan'
import type {
  ImportLogRecord,
  PredictionDraftRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  RaceRecord,
} from '../../domain/types/firestore'
import type { PredictionDocument } from '../../domain/types/import'
import { PredictionDocumentSchema } from '../../domain/validation/prediction'
import {
  buildRegisteredRaceId,
  RaceRegistrationSchema,
  type RaceRegistrationInput,
} from '../../features/races/model'
import { firestore } from '../firebase/client'

type FirestoreRace = RaceRecord<Timestamp | null>
type FirestoreDraft = PredictionDraftRecord<Timestamp | null>
type FirestoreVersion = PredictionVersionRecord<Timestamp | null>
type FirestorePurchasePlan = PurchasePlanRecord<Timestamp | null>

export class RepositoryError extends Error {}
export class DuplicateRaceError extends RepositoryError {}
export class DuplicateImportError extends RepositoryError {}
export class DuplicatePredictionVersionError extends RepositoryError {}
export class DraftConflictError extends RepositoryError {}
export class DuplicatePurchasePlanError extends RepositoryError {}

function requireFirestore(database?: Firestore): Firestore {
  const configuredFirestore = database ?? firestore
  if (!configuredFirestore) {
    throw new RepositoryError('Firebaseが未設定です。設定画面を確認してください。')
  }
  return configuredFirestore
}
function userRacePath(userId: string, raceId: string) {
  return ['users', userId, 'races', raceId] as const
}

export function subscribeRaces(
  userId: string,
  onData: (races: FirestoreRace[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    collection(db, 'users', userId, 'races'),
    (snapshot) => {
      const races = snapshot.docs
        .map((entry) => entry.data() as FirestoreRace)
        .sort(
          (left, right) =>
            right.date.localeCompare(left.date) ||
            left.raceNumber - right.raceNumber,
        )
      onData(races)
    },
    onError,
  )
}

export function subscribeRace(
  userId: string,
  raceId: string,
  onData: (race: FirestoreRace | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    doc(db, ...userRacePath(userId, raceId)),
    (snapshot) => onData(snapshot.exists() ? (snapshot.data() as FirestoreRace) : null),
    onError,
  )
}

export function subscribePredictionDraft(
  userId: string,
  raceId: string,
  onData: (draft: FirestoreDraft | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    doc(db, ...userRacePath(userId, raceId), 'drafts', 'current'),
    (snapshot) => onData(snapshot.exists() ? (snapshot.data() as FirestoreDraft) : null),
    onError,
  )
}

export function subscribePredictionVersions(
  userId: string,
  raceId: string,
  onData: (versions: Array<FirestoreVersion & { id: string }>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    collection(db, ...userRacePath(userId, raceId), 'predictionVersions'),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((entry) => ({ id: entry.id, ...(entry.data() as FirestoreVersion) }))
          .sort((left, right) => right.versionNumber - left.versionNumber),
      )
    },
    onError,
  )
}

export function subscribePredictionVersion(
  userId: string,
  raceId: string,
  versionId: string,
  onData: (version: (FirestoreVersion & { id: string }) | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    doc(db, ...userRacePath(userId, raceId), 'predictionVersions', versionId),
    (snapshot) =>
      onData(
        snapshot.exists()
          ? { id: snapshot.id, ...(snapshot.data() as FirestoreVersion) }
          : null,
      ),
    onError,
  )
}

export function subscribePurchasePlans(
  userId: string,
  raceId: string,
  onData: (plans: FirestorePurchasePlan[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    collection(db, ...userRacePath(userId, raceId), 'plans'),
    (snapshot) => {
      const plans = snapshot.docs
        .map((entry) => entry.data() as FirestorePurchasePlan)
        .sort((left, right) => {
          const leftMillis = left.createdAt?.toMillis?.() ?? 0
          const rightMillis = right.createdAt?.toMillis?.() ?? 0
          return rightMillis - leftMillis || left.planId.localeCompare(right.planId)
        })
      onData(plans)
    },
    onError,
  )
}

export async function createRace(
  userId: string,
  rawInput: RaceRegistrationInput,
) {
  const db = requireFirestore()
  const input = RaceRegistrationSchema.parse(rawInput)
  const raceId = buildRegisteredRaceId(input)
  const raceRef = doc(db, ...userRacePath(userId, raceId))

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(raceRef)
    if (existing.exists()) {
      throw new DuplicateRaceError('同じ開催情報のレースが既に登録されています。')
    }
    transaction.set(raceRef, {
      raceId,
      date: input.date,
      distanceM: input.distanceM,
      latestPredictionVersionId: null,
      name: input.name,
      organizer: input.organizer,
      raceNumber: input.raceNumber,
      resultStatus: 'none',
      status: 'registered',
      surface: input.surface,
      venueCode: input.venueCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })

  return raceId
}

function assertValidPrediction(payload: PredictionDocument) {
  const parsed = PredictionDocumentSchema.safeParse(payload)
  if (!parsed.success) {
    throw new RepositoryError('予想データに検証エラーがあります。')
  }
  return parsed.data
}

export async function savePredictionDraft(input: {
  clientId: string
  database?: Firestore
  expectedRevision: number
  payload: PredictionDocument
  raceId: string
  userId: string
}) {
  const db = requireFirestore(input.database)
  const payload = assertValidPrediction(input.payload)
  const draftRef = doc(
    db,
    ...userRacePath(input.userId, input.raceId),
    'drafts',
    'current',
  )
  const raceRef = doc(db, ...userRacePath(input.userId, input.raceId))

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(draftRef)
    const currentRevision = snapshot.exists()
      ? (snapshot.data() as FirestoreDraft).revision
      : 0
    if (currentRevision !== input.expectedRevision) {
      throw new DraftConflictError(
        '別の端末で下書きが更新されました。クラウド版を読み直してください。',
      )
    }

    const revision = currentRevision + 1
    const baseVersionId = snapshot.exists()
      ? (snapshot.data() as FirestoreDraft).baseVersionId
      : null
    transaction.set(draftRef, {
      baseVersionId,
      lastEditedAt: serverTimestamp(),
      lastEditedByClient: input.clientId,
      payload,
      revision,
      schemaVersion: '1.0.0',
    })
    transaction.update(raceRef, {
      status: 'predicting',
      updatedAt: serverTimestamp(),
    })
    return revision
  })
}

export async function importPredictionDraft(input: {
  clientId: string
  database?: Firestore
  expectedRevision: number
  payload: PredictionDocument
  raceId: string
  sourceFileName: string | null
  userId: string
}) {
  const db = requireFirestore(input.database)
  const payload = assertValidPrediction(input.payload)
  if (payload.race_id !== input.raceId) {
    throw new RepositoryError('JSONのrace_idが表示中のレースと一致しません。')
  }
  const contentHash = await hashPredictionDocument(payload)
  const importId = `prediction-${input.raceId}-${contentHash.slice(0, 24)}`
  const importRef = doc(db, 'users', input.userId, 'importLog', importId)
  const draftRef = doc(
    db,
    ...userRacePath(input.userId, input.raceId),
    'drafts',
    'current',
  )
  const raceRef = doc(db, ...userRacePath(input.userId, input.raceId))

  const revision = await runTransaction(db, async (transaction) => {
    const [importSnapshot, draftSnapshot] = await Promise.all([
      transaction.get(importRef),
      transaction.get(draftRef),
    ])
    if (importSnapshot.exists()) {
      throw new DuplicateImportError('同じ予想JSONは既に取り込み済みです。')
    }
    const currentRevision = draftSnapshot.exists()
      ? (draftSnapshot.data() as FirestoreDraft).revision
      : 0
    if (currentRevision !== input.expectedRevision) {
      throw new DraftConflictError(
        '別の端末で下書きが更新されました。プレビューをやり直してください。',
      )
    }

    const nextRevision = currentRevision + 1
    const baseVersionId = draftSnapshot.exists()
      ? (draftSnapshot.data() as FirestoreDraft).baseVersionId
      : null
    transaction.set(draftRef, {
      baseVersionId,
      lastEditedAt: serverTimestamp(),
      lastEditedByClient: input.clientId,
      payload,
      revision: nextRevision,
      schemaVersion: '1.0.0',
    })
    transaction.set(importRef, {
      contentHash,
      documentType: 'prediction',
      importedAt: serverTimestamp(),
      raceId: input.raceId,
      schemaVersion: '1.0.0',
      sourceFileName: input.sourceFileName,
      targetId: 'current',
    } satisfies Omit<ImportLogRecord<unknown>, 'importedAt'> & {
      importedAt: unknown
    })
    transaction.update(raceRef, {
      status: 'predicting',
      updatedAt: serverTimestamp(),
    })
    return nextRevision
  })

  return { contentHash, importId, revision }
}

export async function finalizePrediction(input: {
  changeReason: string
  clientId: string
  database?: Firestore
  expectedRevision: number
  raceId: string
  userId: string
}) {
  const db = requireFirestore(input.database)
  const draftRef = doc(
    db,
    ...userRacePath(input.userId, input.raceId),
    'drafts',
    'current',
  )
  const raceRef = doc(db, ...userRacePath(input.userId, input.raceId))
  const versionRef = doc(
    collection(db, ...userRacePath(input.userId, input.raceId), 'predictionVersions'),
  )

  return runTransaction(db, async (transaction) => {
    const [draftSnapshot, raceSnapshot] = await Promise.all([
      transaction.get(draftRef),
      transaction.get(raceRef),
    ])
    if (!draftSnapshot.exists()) {
      throw new RepositoryError('確定できる下書きがありません。')
    }
    if (!raceSnapshot.exists()) {
      throw new RepositoryError('対象レースが見つかりません。')
    }
    const draft = draftSnapshot.data() as FirestoreDraft
    if (draft.revision !== input.expectedRevision) {
      throw new DraftConflictError(
        '別の端末で下書きが更新されました。確定前に読み直してください。',
      )
    }
    const payload = assertValidPrediction(draft.payload)
    const race = raceSnapshot.data() as FirestoreRace
    let versionNumber = 1
    if (race.latestPredictionVersionId) {
      const latestRef = doc(
        db,
        ...userRacePath(input.userId, input.raceId),
        'predictionVersions',
        race.latestPredictionVersionId,
      )
      const latestSnapshot = await transaction.get(latestRef)
      if (latestSnapshot.exists()) {
        const latestVersion = latestSnapshot.data() as FirestoreVersion
        if (hasSamePredictionContent(latestVersion.snapshot, payload)) {
          throw new DuplicatePredictionVersionError(
            '最新の確定予想から予想内容が変更されていません。下書きを変更してから確定してください。',
          )
        }
        versionNumber = latestVersion.versionNumber + 1
      }
    }
    const contentHash = await hashPredictionDocument(payload)
    const nextRevision = draft.revision + 1

    transaction.set(versionRef, {
      authorUid: input.userId,
      changeReason: input.changeReason.trim(),
      confirmedAt: serverTimestamp(),
      contentHash,
      createdAt: serverTimestamp(),
      parentVersionId: draft.baseVersionId,
      schemaVersion: '1.0.0',
      snapshot: payload,
      status: 'final',
      versionNumber,
    })
    transaction.update(raceRef, {
      latestPredictionVersionId: versionRef.id,
      status: 'prediction_confirmed',
      updatedAt: serverTimestamp(),
    })
    transaction.update(draftRef, {
      baseVersionId: versionRef.id,
      lastEditedAt: serverTimestamp(),
      lastEditedByClient: input.clientId,
      revision: nextRevision,
    })

    return { contentHash, revision: nextRevision, versionId: versionRef.id, versionNumber }
  })
}

export async function savePurchasePlan(input: {
  data: PurchasePlanWriteData
  database?: Firestore
  raceId: string
  userId: string
}) {
  const db = requireFirestore(input.database)
  if (input.data.authorUid !== input.userId) {
    throw new RepositoryError('保存ユーザーとプラン作成者が一致しません。')
  }
  const validationIssues = validatePurchasePlanWriteData(input.data)
  if (validationIssues.length > 0) {
    throw new RepositoryError(validationIssues.join(' '))
  }

  const planRef = doc(
    db,
    ...userRacePath(input.userId, input.raceId),
    'plans',
    input.data.planId,
  )
  const versionRef = doc(
    db,
    ...userRacePath(input.userId, input.raceId),
    'predictionVersions',
    input.data.sourcePredictionVersionId,
  )

  await runTransaction(db, async (transaction) => {
    const [planSnapshot, versionSnapshot] = await Promise.all([
      transaction.get(planRef),
      transaction.get(versionRef),
    ])
    if (planSnapshot.exists()) {
      throw new DuplicatePurchasePlanError(
        'この購入プランは既に保存されています。保存済み一覧を確認してください。',
      )
    }
    if (!versionSnapshot.exists()) {
      throw new RepositoryError('元の確定予想バージョンが見つかりません。')
    }
    const version = versionSnapshot.data() as FirestoreVersion
    if (version.status !== 'final') {
      throw new RepositoryError('確定予想以外から購入プランを保存できません。')
    }
    transaction.set(planRef, {
      ...input.data,
      createdAt: serverTimestamp(),
    })
  })

  return input.data.planId
}
