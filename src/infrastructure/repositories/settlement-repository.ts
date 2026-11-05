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
  calculateRaceSettlement,
  selectEffectivePurchases,
  settlePurchase,
} from '../../domain/calculations/settlement'
import { hashDocument } from '../../domain/prediction-utils'
import { hasResultInputPlaceholders } from '../../domain/result-template'
import type {
  ImportLogRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  PurchaseRecord,
  RaceRecord,
  ResultRecord,
} from '../../domain/types/firestore'
import type { ResultDocument } from '../../domain/types/import'
import type { PurchaseInput } from '../../domain/validation/purchase'
import { PurchaseInputSchema } from '../../domain/validation/purchase'
import { ResultDocumentSchema } from '../../domain/validation/result'
import { firestore } from '../firebase/client'

type FirestorePurchase = PurchaseRecord<Timestamp | null>
type FirestoreResult = ResultRecord<Timestamp | null>

export class SettlementRepositoryError extends Error {}
export class DuplicateSettlementError extends SettlementRepositoryError {}
export class SettlementConflictError extends SettlementRepositoryError {}

function requireFirestore(database?: Firestore) {
  const configured = database ?? firestore
  if (!configured) {
    throw new SettlementRepositoryError('Firebaseが未設定です。設定画面を確認してください。')
  }
  return configured
}

function racePath(userId: string, raceId: string) {
  return ['users', userId, 'races', raceId] as const
}

export function subscribePurchases(
  userId: string,
  raceId: string,
  onData: (purchases: FirestorePurchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    collection(db, ...racePath(userId, raceId), 'purchases'),
    (snapshot) => onData(snapshot.docs.map((entry) => entry.data() as FirestorePurchase)),
    onError,
  )
}

export function subscribeResults(
  userId: string,
  raceId: string,
  onData: (results: FirestoreResult[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  return onSnapshot(
    collection(db, ...racePath(userId, raceId), 'results'),
    (snapshot) => onData(snapshot.docs.map((entry) => entry.data() as FirestoreResult)),
    onError,
  )
}

function parsePurchase(input: PurchaseInput) {
  const parsed = PurchaseInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new SettlementRepositoryError(parsed.error.issues.map((issue) => issue.message).join(' '))
  }
  return parsed.data
}

function purchaseTotal(input: PurchaseInput) {
  return input.items.reduce((total, item) => total + item.stakeYen, 0)
}

const MAX_ACTIVE_PURCHASES_PER_RACE = 500

function purchaseAggregateState(race: RaceRecord<unknown>) {
  const activePurchaseIds = race.activePurchaseIds ?? []
  const purchaseRevision = race.purchaseRevision ?? 0
  if (
    !Number.isInteger(purchaseRevision) ||
    purchaseRevision < 0 ||
    activePurchaseIds.length > MAX_ACTIVE_PURCHASES_PER_RACE ||
    new Set(activePurchaseIds).size !== activePurchaseIds.length
  ) {
    throw new SettlementConflictError(
      '購入記録の集計状態が不正です。レースを再読み込みしてください。',
    )
  }
  return { activePurchaseIds, purchaseRevision }
}

function returnedYenForPurchase(
  purchase: FirestorePurchase,
  result: FirestoreResult,
) {
  const settlement = settlePurchase(purchase, result.payload)
  return settlement.totalPayoutYen + settlement.totalRefundYen
}

export async function savePurchase(input: {
  data: PurchaseInput
  database?: Firestore
  expectedRevision?: number
  status: 'draft' | 'confirmed'
  userId: string
}) {
  const db = requireFirestore(input.database)
  const data = parsePurchase(input.data)
  const purchaseRef = doc(db, ...racePath(input.userId, data.raceId), 'purchases', data.purchaseId)
  const raceRef = doc(db, ...racePath(input.userId, data.raceId))
  const ledgerRef = doc(db, 'users', input.userId, 'bankrollTransactions', `stake-${data.purchaseId}`)
  const planRef = data.sourcePlanId
    ? doc(db, ...racePath(input.userId, data.raceId), 'plans', data.sourcePlanId)
    : null
  const versionRef = data.sourcePredictionVersionId
    ? doc(db, ...racePath(input.userId, data.raceId), 'predictionVersions', data.sourcePredictionVersionId)
    : null

  return runTransaction(db, async (transaction) => {
    const [purchaseSnapshot, raceSnapshot, planSnapshot, versionSnapshot, ledgerSnapshot] =
      await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(raceRef),
        planRef ? transaction.get(planRef) : Promise.resolve(null),
        versionRef ? transaction.get(versionRef) : Promise.resolve(null),
        transaction.get(ledgerRef),
      ])
    if (!raceSnapshot.exists()) {
      throw new SettlementRepositoryError('対象レースが見つかりません。')
    }
    const race = raceSnapshot.data() as RaceRecord<unknown>
    const aggregate = purchaseAggregateState(race)
    if (planRef && !planSnapshot?.exists()) {
      throw new SettlementRepositoryError('元の購入プランが見つかりません。')
    }
    if (planSnapshot?.exists()) {
      const plan = planSnapshot.data() as PurchasePlanRecord<unknown>
      if (data.sourcePredictionVersionId !== plan.sourcePredictionVersionId) {
        throw new SettlementRepositoryError(
          '購入プランと元の確定予想バージョンが一致しません。',
        )
      }
    }
    if (versionRef) {
      if (!versionSnapshot?.exists()) {
        throw new SettlementRepositoryError('元の確定予想が見つかりません。')
      }
      const version = versionSnapshot.data() as PredictionVersionRecord<unknown>
      if (version.status !== 'final') {
        throw new SettlementRepositoryError('確定予想以外を参照できません。')
      }
    }
    if (purchaseSnapshot.exists()) {
      const current = purchaseSnapshot.data() as FirestorePurchase
      if (current.status !== 'draft') {
        throw new DuplicateSettlementError('同じ購入記録は既に保存されています。')
      }
      if (current.revision !== input.expectedRevision) {
        throw new SettlementConflictError('購入下書きが別の端末で更新されました。')
      }
    }
    if (input.status === 'confirmed' && ledgerSnapshot.exists()) {
      throw new DuplicateSettlementError('購入金額は既に収支台帳へ記録されています。')
    }
    if (
      input.status === 'confirmed' &&
      aggregate.activePurchaseIds.includes(data.purchaseId)
    ) {
      throw new DuplicateSettlementError('同じ購入記録は既に有効化されています。')
    }
    if (
      input.status === 'confirmed' &&
      aggregate.activePurchaseIds.length >= MAX_ACTIVE_PURCHASES_PER_RACE
    ) {
      throw new SettlementRepositoryError(
        `1レースの有効購入記録は${MAX_ACTIVE_PURCHASES_PER_RACE}件までです。`,
      )
    }

    const activeResultRef =
      input.status === 'confirmed' && race.latestResultId
        ? doc(
            db,
            ...racePath(input.userId, data.raceId),
            'results',
            race.latestResultId,
          )
        : null
    const lateReturnRef = activeResultRef
      ? doc(
          db,
          'users',
          input.userId,
          'bankrollTransactions',
          `return-purchase-${data.purchaseId}-${race.latestResultId}`,
        )
      : null
    const [activeResultSnapshot, lateReturnSnapshot] = await Promise.all([
      activeResultRef ? transaction.get(activeResultRef) : Promise.resolve(null),
      lateReturnRef ? transaction.get(lateReturnRef) : Promise.resolve(null),
    ])
    if (activeResultRef && !activeResultSnapshot?.exists()) {
      throw new SettlementConflictError(
        '最新の確定結果を確認できません。レースを再読み込みしてください。',
      )
    }
    if (lateReturnSnapshot?.exists()) {
      throw new DuplicateSettlementError(
        'この購入記録の払戻・返還は既に台帳へ記録されています。',
      )
    }

    const revision = purchaseSnapshot.exists()
      ? (purchaseSnapshot.data() as FirestorePurchase).revision + 1
      : 1
    const totalStakeYen = purchaseTotal(data)
    const now = serverTimestamp()
    const purchaseRecord = {
      ...data,
      authorUid: input.userId,
      confirmedAt: input.status === 'confirmed' ? now : null,
      correctionOf: null,
      correctionSequence: 0,
      createdAt: purchaseSnapshot.exists()
        ? (purchaseSnapshot.data() as FirestorePurchase).createdAt
        : now,
      recordedAt: now,
      revision,
      rootPurchaseId: data.purchaseId,
      status: input.status,
      totalStakeYen,
      updatedAt: now,
    }
    transaction.set(purchaseRef, purchaseRecord)
    if (input.status === 'confirmed') {
      transaction.set(ledgerRef, {
        amountYen: -totalStakeYen,
        at: now,
        authorUid: input.userId,
        idempotencyKey: `stake-${data.idempotencyKey}`,
        kind: 'stake',
        note: '購入確定',
        raceId: data.raceId,
        referenceId: data.purchaseId,
        transactionId: ledgerRef.id,
      })
      if (activeResultSnapshot?.exists() && lateReturnRef) {
        const activeResult = activeResultSnapshot.data() as FirestoreResult
        const returnedYen = returnedYenForPurchase(
          purchaseRecord as unknown as FirestorePurchase,
          activeResult,
        )
        transaction.set(lateReturnRef, {
          amountYen: returnedYen,
          at: now,
          authorUid: input.userId,
          idempotencyKey: lateReturnRef.id,
          kind: 'payout',
          note: '結果確定後に追加した購入の確定払戻・返還',
          raceId: data.raceId,
          referenceId: data.purchaseId,
          transactionId: lateReturnRef.id,
        })
      }
      transaction.update(raceRef, {
        activePurchaseIds: [...aggregate.activePurchaseIds, data.purchaseId],
        purchaseRevision: aggregate.purchaseRevision + 1,
        status: activeResultSnapshot?.exists() ? 'result_recorded' : 'purchased',
        updatedAt: now,
      })
    }
    return {
      purchaseId: data.purchaseId,
      purchaseRevision:
        input.status === 'confirmed'
          ? aggregate.purchaseRevision + 1
          : aggregate.purchaseRevision,
      revision,
    }
  })
}

export async function correctPurchase(input: {
  data: Omit<PurchaseInput, 'purchaseId' | 'idempotencyKey' | 'sourcePlanId' | 'sourcePredictionVersionId'>
  database?: Firestore
  originalPurchaseId: string
  userId: string
}) {
  const db = requireFirestore(input.database)
  const originalRef = doc(db, ...racePath(input.userId, input.data.raceId), 'purchases', input.originalPurchaseId)
  const raceRef = doc(db, ...racePath(input.userId, input.data.raceId))
  return runTransaction(db, async (transaction) => {
    const [originalSnapshot, raceSnapshot] = await Promise.all([
      transaction.get(originalRef),
      transaction.get(raceRef),
    ])
    if (!originalSnapshot.exists()) {
      throw new SettlementRepositoryError('訂正元の購入記録が見つかりません。')
    }
    const original = originalSnapshot.data() as FirestorePurchase
    if (original.status === 'draft') {
      throw new SettlementRepositoryError('下書きは訂正履歴ではなく直接編集してください。')
    }
    if (!raceSnapshot.exists()) {
      throw new SettlementRepositoryError('対象レースが見つかりません。')
    }
    const race = raceSnapshot.data() as RaceRecord<unknown>
    const aggregate = purchaseAggregateState(race)
    if (!aggregate.activePurchaseIds.includes(original.purchaseId)) {
      throw new SettlementConflictError(
        '訂正元は最新の有効購入記録ではありません。レースを再読み込みしてください。',
      )
    }
    const activeResultRef = race.latestResultId
      ? doc(
          db,
          ...racePath(input.userId, input.data.raceId),
          'results',
          race.latestResultId,
        )
      : null
    const activeResultSnapshot = activeResultRef
      ? await transaction.get(activeResultRef)
      : null
    if (activeResultRef && !activeResultSnapshot?.exists()) {
      throw new SettlementConflictError(
        '最新の確定結果を確認できません。レースを再読み込みしてください。',
      )
    }
    const correctionSequence = original.correctionSequence + 1
    const purchaseId = `${original.rootPurchaseId}-c${correctionSequence}`
    const data = parsePurchase({
      ...input.data,
      idempotencyKey: `correct-${purchaseId}`,
      purchaseId,
      sourcePlanId: original.sourcePlanId,
      sourcePredictionVersionId: original.sourcePredictionVersionId,
    })
    const correctionRef = doc(db, ...racePath(input.userId, data.raceId), 'purchases', purchaseId)
    const ledgerRef = doc(db, 'users', input.userId, 'bankrollTransactions', `stake-adjust-${purchaseId}`)
    const [correctionSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(correctionRef),
      transaction.get(ledgerRef),
    ])
    if (correctionSnapshot.exists() || ledgerSnapshot.exists()) {
      throw new DuplicateSettlementError('同じ訂正記録が既に存在します。')
    }
    const totalStakeYen = purchaseTotal(data)
    const now = serverTimestamp()
    transaction.set(correctionRef, {
      ...data,
      authorUid: input.userId,
      confirmedAt: now,
      correctionOf: original.purchaseId,
      correctionSequence,
      createdAt: now,
      recordedAt: now,
      revision: 1,
      rootPurchaseId: original.rootPurchaseId,
      status: 'corrected',
      totalStakeYen,
      updatedAt: now,
    })
    const corrected = {
      ...original,
      items: data.items,
      totalStakeYen,
    }
    const activeResult = activeResultSnapshot?.exists()
      ? (activeResultSnapshot.data() as FirestoreResult)
      : null
    const originalSettlement = activeResult
      ? settlePurchase(original, activeResult.payload)
      : null
    const correctedSettlement = activeResult
      ? settlePurchase(corrected, activeResult.payload)
      : null
    const originalReturnedYen = originalSettlement
      ? originalSettlement.totalPayoutYen + originalSettlement.totalRefundYen
      : 0
    const correctedReturnedYen = correctedSettlement
      ? correctedSettlement.totalPayoutYen + correctedSettlement.totalRefundYen
      : 0
    const delta =
      original.totalStakeYen -
      totalStakeYen +
      correctedReturnedYen -
      originalReturnedYen
    transaction.set(ledgerRef, {
      amountYen: delta,
      at: now,
      authorUid: input.userId,
      idempotencyKey: `stake-adjust-${purchaseId}`,
      kind: 'adjustment',
      note: activeResult
        ? '購入記録の訂正による購入・払戻差額'
        : '購入記録の訂正差額',
      raceId: data.raceId,
      referenceId: purchaseId,
      transactionId: ledgerRef.id,
    })
    transaction.update(raceRef, {
      activePurchaseIds: aggregate.activePurchaseIds.map((purchaseId) =>
        purchaseId === original.purchaseId ? data.purchaseId : purchaseId,
      ),
      purchaseRevision: aggregate.purchaseRevision + 1,
      updatedAt: now,
    })
    return purchaseId
  })
}

function parseResult(payload: ResultDocument) {
  const parsed = ResultDocumentSchema.safeParse(payload)
  if (!parsed.success) {
    throw new SettlementRepositoryError(parsed.error.issues.map((issue) => issue.message).join(' '))
  }
  if (parsed.data.result_status === 'draft') {
    throw new SettlementRepositoryError('結果を確定する前にresult_statusをconfirmedにしてください。')
  }
  if (hasResultInputPlaceholders(parsed.data)) {
    throw new SettlementRepositoryError(
      '入力待ちテンプレートやプレースホルダーURLは確定保存できません。',
    )
  }
  return parsed.data
}

export async function saveResult(input: {
  database?: Firestore
  expectedPurchaseRevision: number
  originalResultId?: string
  payload: ResultDocument
  sourceFileName: string | null
  userId: string
}) {
  const db = requireFirestore(input.database)
  const payload = parseResult(input.payload)
  if (input.originalResultId) {
    if (
      payload.result_status !== 'corrected' ||
      payload.correction_of !== input.originalResultId
    ) {
      throw new SettlementRepositoryError(
        '訂正結果はresult_status=correctedと訂正元IDを指定してください。',
      )
    }
  } else if (payload.result_status !== 'confirmed' || payload.correction_of) {
    throw new SettlementRepositoryError(
      '初回結果はresult_status=confirmedとして登録してください。',
    )
  }
  const contentHash = await hashDocument(payload)
  const raceRef = doc(db, ...racePath(input.userId, payload.race_id))
  const originalRef = input.originalResultId
    ? doc(db, ...racePath(input.userId, payload.race_id), 'results', input.originalResultId)
    : null

  return runTransaction(db, async (transaction) => {
    const [raceSnapshot, originalSnapshot] = await Promise.all([
      transaction.get(raceRef),
      originalRef ? transaction.get(originalRef) : Promise.resolve(null),
    ])
    if (!raceSnapshot.exists()) {
      throw new SettlementRepositoryError('対象レースが見つかりません。')
    }
    const race = raceSnapshot.data() as RaceRecord<unknown>
    const aggregate = purchaseAggregateState(race)
    if (aggregate.purchaseRevision !== input.expectedPurchaseRevision) {
      throw new SettlementConflictError(
        '購入記録が別の端末で更新されました。最新状態を読み直してから結果を確定してください。',
      )
    }
    const original = originalSnapshot?.exists()
      ? (originalSnapshot.data() as FirestoreResult)
      : null
    if (input.originalResultId && !original) {
      throw new SettlementRepositoryError('訂正元のレース結果が見つかりません。')
    }
    if (input.originalResultId) {
      if (race.latestResultId !== input.originalResultId) {
        throw new SettlementConflictError(
          '訂正元は最新の確定結果ではありません。最新結果を読み直してください。',
        )
      }
    } else if (race.latestResultId) {
      throw new SettlementConflictError(
        'このレースには確定結果があります。最新結果から訂正を開始してください。',
      )
    }

    const purchaseRefs = aggregate.activePurchaseIds.map((purchaseId) =>
      doc(
        db,
        ...racePath(input.userId, payload.race_id),
        'purchases',
        purchaseId,
      ),
    )
    const purchaseSnapshots = await Promise.all(
      purchaseRefs.map((reference) => transaction.get(reference)),
    )
    const purchases = purchaseSnapshots.map((snapshot, index) => {
      if (!snapshot.exists()) {
        throw new SettlementConflictError(
          '有効購入記録の一部が見つかりません。再読み込みしてください。',
        )
      }
      const purchase = snapshot.data() as FirestorePurchase
      if (
        purchase.purchaseId !== aggregate.activePurchaseIds[index] ||
        purchase.status === 'draft'
      ) {
        throw new SettlementConflictError(
          '有効購入記録とレース集計が一致しません。再読み込みしてください。',
        )
      }
      return purchase
    })
    const selectedPurchases = selectEffectivePurchases(purchases)
    if (
      selectedPurchases.length !== aggregate.activePurchaseIds.length ||
      selectedPurchases.some(
        (purchase) =>
          !aggregate.activePurchaseIds.includes(purchase.purchaseId),
      )
    ) {
      throw new SettlementConflictError(
        '購入訂正チェーンの最新版が一致しません。再読み込みしてください。',
      )
    }

    const correctionSequence = original ? original.correctionSequence + 1 : 0
    const rootResultId = original?.rootResultId ?? `result-${contentHash.slice(0, 24)}`
    const resultId = original ? `${rootResultId}-c${correctionSequence}` : rootResultId
    const resultRef = doc(db, ...racePath(input.userId, payload.race_id), 'results', resultId)
    const importId = `result-${payload.race_id}-${contentHash.slice(0, 24)}`
    const importRef = doc(db, 'users', input.userId, 'importLog', importId)
    const ledgerRef = doc(db, 'users', input.userId, 'bankrollTransactions', `return-${resultId}`)
    const [resultSnapshot, importSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(resultRef),
      transaction.get(importRef),
      transaction.get(ledgerRef),
    ])
    if (resultSnapshot.exists() || importSnapshot.exists() || ledgerSnapshot.exists()) {
      throw new DuplicateSettlementError('同じレース結果は既に登録されています。')
    }
    const summary = calculateRaceSettlement(selectedPurchases, payload)
    const previousSummary = original
      ? calculateRaceSettlement(selectedPurchases, original.payload)
      : null
    const returnDelta = summary.returnedYen - (previousSummary?.returnedYen ?? 0)
    const now = serverTimestamp()
    transaction.set(resultRef, {
      activePurchaseIds: aggregate.activePurchaseIds,
      authorUid: input.userId,
      confirmedAt: now,
      contentHash,
      correctionOf: original?.resultId ?? null,
      correctionSequence,
      createdAt: now,
      idempotencyKey: importId,
      importId,
      payload,
      purchaseRevision: aggregate.purchaseRevision,
      raceId: payload.race_id,
      resultId,
      rootResultId,
      status: original ? 'corrected' : 'confirmed',
      updatedAt: now,
    })
    transaction.set(importRef, {
      contentHash,
      documentType: 'result',
      importedAt: now,
      raceId: payload.race_id,
      schemaVersion: '1.0.0',
      sourceFileName: input.sourceFileName,
      targetId: resultId,
    } satisfies Omit<ImportLogRecord<unknown>, 'importedAt'> & { importedAt: unknown })
    transaction.set(ledgerRef, {
      amountYen: returnDelta,
      at: now,
      authorUid: input.userId,
      idempotencyKey: `return-${resultId}`,
      kind: original ? 'adjustment' : 'payout',
      note: original ? 'レース結果訂正による払戻差額' : '確定払戻・返還',
      raceId: payload.race_id,
      referenceId: resultId,
      transactionId: ledgerRef.id,
    })
    transaction.update(raceRef, {
      latestResultId: resultId,
      resultStatus: 'confirmed',
      status: 'result_recorded',
      updatedAt: now,
    })
    return { resultId, summary }
  })
}

export function purchaseInputFromPlan(
  plan: PurchasePlanRecord<unknown>,
  raceId: string,
  purchaseId: string,
): PurchaseInput {
  return {
    idempotencyKey: `purchase-${purchaseId}`,
    items: plan.allocations.map((allocation, index) => {
      const candidate = plan.candidateSnapshot.find(
        (entry) => entry.candidateId === allocation.candidateId,
      )
      if (!candidate) {
        throw new SettlementRepositoryError('購入プランの候補スナップショットが不足しています。')
      }
      return {
        betType: candidate.betType,
        itemId: `${purchaseId}-item-${index + 1}`,
        purchaseOdds: candidate.odds,
        selections: candidate.selections,
        sourceCandidateId: candidate.candidateId,
        stakeYen: allocation.stakeYen,
      }
    }),
    memo: '',
    placedAt: new Date().toISOString(),
    purchaseId,
    raceId,
    sourcePlanId: plan.planId,
    sourcePredictionVersionId: plan.sourcePredictionVersionId,
  }
}
