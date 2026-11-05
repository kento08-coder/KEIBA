import fs from 'node:fs'
import path from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import { calculateRaceSettlement } from '../../src/domain/calculations/settlement'
import type { PurchaseRecord } from '../../src/domain/types/firestore'
import type { ResultDocument } from '../../src/domain/types/import'
import {
  DuplicateSettlementError,
  correctPurchase,
  savePurchase,
  saveResult,
} from '../../src/infrastructure/repositories/settlement-repository'

const projectId = 'keiba-settlement-workflow-test'
const raceId = '2026-11-08-TOKYO-11-JRA'
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/owner-a/races/${raceId}`), {
      activePurchaseIds: [],
      latestPurchaseId: null,
      latestResultId: null,
      purchaseRevision: 0,
      raceId,
      status: 'prediction_confirmed',
    })
  })
})

afterAll(async () => environment.cleanup())

function purchaseData(purchaseId = 'purchase-0001') {
  return {
    idempotencyKey: `idempotency-${purchaseId}`,
    items: [{ betType: 'win' as const, itemId: `${purchaseId}-item-1`, purchaseOdds: 4.8, selections: [2], sourceCandidateId: null, stakeYen: 500 }],
    memo: '',
    placedAt: '2026-11-08T12:00:00+09:00',
    purchaseId,
    raceId,
    sourcePlanId: null,
    sourcePredictionVersionId: null,
  }
}

function resultData() {
  const result = JSON.parse(
    fs.readFileSync(path.resolve('examples/result.sample.json'), 'utf8'),
  ) as ResultDocument
  return { ...result, race_id: raceId }
}

function correctedResult(
  originalResultId: string,
  sequence: number,
  payoutPer100Yen: number,
) {
  const result = resultData()
  return {
    ...result,
    change_reason: `結果訂正${sequence}`,
    correction_of: originalResultId,
    payouts: result.payouts.map((payout) =>
      payout.bet_type === 'win' && payout.horse_numbers[0] === 2
        ? { ...payout, payout_per_100_yen: payoutPer100Yen }
        : payout,
    ),
    result_status: 'corrected' as const,
  }
}

function ownerDatabase() {
  return environment.authenticatedContext('owner-a').firestore() as unknown as Firestore
}

describe('purchase/result transactional persistence', () => {
  it('rejects an unedited result template marker before writing anything', async () => {
    const database = ownerDatabase()
    await expect(
      saveResult({
        database,
        expectedPurchaseRevision: 0,
        payload: { ...resultData(), source_agent: 'manual-entry-pending' },
        sourceFileName: null,
        userId: 'owner-a',
      }),
    ).rejects.toThrow('入力待ちテンプレート')
    expect(
      (await getDocs(collection(database, `users/owner-a/races/${raceId}/results`)))
        .empty,
    ).toBe(true)
  })

  it('saves a confirmed purchase and rejects a duplicate idempotently', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    await expect(savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })).rejects.toBeInstanceOf(DuplicateSettlementError)
    expect((await getDoc(doc(database, 'users/owner-a/bankrollTransactions/stake-purchase-0001'))).data()?.amountYen).toBe(-500)
  })

  it('adds a correction record without overwriting the confirmed purchase', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const correctionId = await correctPurchase({
      data: { items: [{ ...purchaseData().items[0]!, stakeYen: 100 }], memo: '金額訂正', placedAt: purchaseData().placedAt, raceId },
      database,
      originalPurchaseId: 'purchase-0001',
      userId: 'owner-a',
    })
    expect(correctionId).toBe('purchase-0001-c1')
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/purchases/purchase-0001`))).data()?.totalStakeYen).toBe(500)
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/purchases/${correctionId}`))).data()?.totalStakeYen).toBe(100)
  })

  it('atomically saves official result, import log and realized return', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const saved = await saveResult({ database, expectedPurchaseRevision: 1, payload: resultData(), sourceFileName: 'result.json', userId: 'owner-a' })
    expect(saved.summary).toMatchObject({ netProfitYen: 1_900, returnedYen: 2_400, stakeYen: 500 })
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/results/${saved.resultId}`))).exists()).toBe(true)
    expect((await getDoc(doc(database, `users/owner-a/bankrollTransactions/return-${saved.resultId}`))).data()?.amountYen).toBe(2_400)
  })

  it('records both stake and realized-return deltas when a purchase is corrected after results', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    await saveResult({ database, expectedPurchaseRevision: 1, payload: resultData(), sourceFileName: 'result.json', userId: 'owner-a' })
    const correctionId = await correctPurchase({
      data: { items: [{ ...purchaseData().items[0]!, stakeYen: 100 }], memo: '結果後の金額訂正', placedAt: purchaseData().placedAt, raceId },
      database,
      originalPurchaseId: 'purchase-0001',
      userId: 'owner-a',
    })
    expect((await getDoc(doc(database, `users/owner-a/bankrollTransactions/stake-adjust-${correctionId}`))).data()?.amountYen).toBe(-1_520)
  })

  it('records the confirmed return when a purchase is added after result confirmation', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const result = await saveResult({ database, expectedPurchaseRevision: 1, payload: resultData(), sourceFileName: 'result.json', userId: 'owner-a' })
    await savePurchase({ data: purchaseData('purchase-late-0002'), database, status: 'confirmed', userId: 'owner-a' })

    expect((await getDoc(doc(database, `users/owner-a/bankrollTransactions/return-purchase-purchase-late-0002-${result.resultId}`))).data()?.amountYen).toBe(2_400)
    const race = (await getDoc(doc(database, `users/owner-a/races/${raceId}`))).data()
    expect(race).toMatchObject({
      activePurchaseIds: ['purchase-0001', 'purchase-late-0002'],
      purchaseRevision: 2,
      status: 'result_recorded',
    })
  })

  it('rejects stale purchase revisions and a missing trusted purchase without partial result writes', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    await expect(saveResult({ database, expectedPurchaseRevision: 0, payload: resultData(), sourceFileName: null, userId: 'owner-a' })).rejects.toThrow('別の端末')

    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/owner-a/races/${raceId}`), {
        activePurchaseIds: ['purchase-0001', 'purchase-missing'],
        latestResultId: null,
        purchaseRevision: 2,
        raceId,
        status: 'purchased',
      })
    })
    await expect(saveResult({ database, expectedPurchaseRevision: 2, payload: resultData(), sourceFileName: null, userId: 'owner-a' })).rejects.toThrow('見つかりません')
    expect((await getDocs(collection(database, `users/owner-a/races/${raceId}/results`))).empty).toBe(true)
  })

  it('supports v1 to v2 to v3 purchase corrections and rejects an old correction source', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const v2 = await correctPurchase({ data: { items: [{ ...purchaseData().items[0]!, stakeYen: 300 }], memo: 'v2', placedAt: purchaseData().placedAt, raceId }, database, originalPurchaseId: 'purchase-0001', userId: 'owner-a' })
    const v3 = await correctPurchase({ data: { items: [{ ...purchaseData().items[0]!, stakeYen: 100 }], memo: 'v3', placedAt: purchaseData().placedAt, raceId }, database, originalPurchaseId: v2, userId: 'owner-a' })

    expect(v3).toBe('purchase-0001-c2')
    await expect(correctPurchase({ data: { items: purchaseData().items, memo: 'stale', placedAt: purchaseData().placedAt, raceId }, database, originalPurchaseId: 'purchase-0001', userId: 'owner-a' })).rejects.toBeInstanceOf(Error)
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}`))).data()).toMatchObject({ activePurchaseIds: [v3], purchaseRevision: 3 })
  })

  it('allows only one concurrent correction from the current purchase version', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const correction = (memo: string) => correctPurchase({ data: { items: [{ ...purchaseData().items[0]!, stakeYen: 100 }], memo, placedAt: purchaseData().placedAt, raceId }, database, originalPurchaseId: 'purchase-0001', userId: 'owner-a' })
    const attempts = await Promise.allSettled([correction('one'), correction('two')])
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((entry) => entry.status === 'rejected')).toHaveLength(1)
  })

  it('supports v1 to v2 to v3 result corrections and rejects an old result source', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const v1 = await saveResult({ database, expectedPurchaseRevision: 1, payload: resultData(), sourceFileName: null, userId: 'owner-a' })
    const v2 = await saveResult({ database, expectedPurchaseRevision: 1, originalResultId: v1.resultId, payload: correctedResult(v1.resultId, 1, 500), sourceFileName: null, userId: 'owner-a' })
    const v3 = await saveResult({ database, expectedPurchaseRevision: 1, originalResultId: v2.resultId, payload: correctedResult(v2.resultId, 2, 520), sourceFileName: null, userId: 'owner-a' })

    expect(v3.resultId).toBe(`${v1.resultId}-c2`)
    await expect(saveResult({ database, expectedPurchaseRevision: 1, originalResultId: v1.resultId, payload: correctedResult(v1.resultId, 3, 540), sourceFileName: null, userId: 'owner-a' })).rejects.toThrow('最新の確定結果')
  })

  it('keeps ledger sum equal to the effective purchases and final result', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    const result = await saveResult({ database, expectedPurchaseRevision: 1, payload: resultData(), sourceFileName: null, userId: 'owner-a' })
    await savePurchase({ data: { ...purchaseData('purchase-late-0002'), items: [{ ...purchaseData('purchase-late-0002').items[0]!, stakeYen: 100 }] }, database, status: 'confirmed', userId: 'owner-a' })

    const purchaseDocs = await getDocs(collection(database, `users/owner-a/races/${raceId}/purchases`))
    const purchases = purchaseDocs.docs.map((entry) => entry.data() as PurchaseRecord<unknown>)
    const expected = calculateRaceSettlement(purchases, resultData())
    const ledger = await getDocs(collection(database, 'users/owner-a/bankrollTransactions'))
    const ledgerTotal = ledger.docs.reduce((sum, entry) => sum + Number(entry.data().amountYen), 0)
    expect(ledgerTotal).toBe(expected.returnedYen - expected.stakeYen)
    expect(ledger.docs.map((entry) => entry.id)).toContain(`return-purchase-purchase-late-0002-${result.resultId}`)
  })

  it('does not leave partial documents when source references are invalid', async () => {
    const database = ownerDatabase()
    await expect(savePurchase({ data: { ...purchaseData('purchase-bad-source'), sourcePlanId: 'missing-plan' }, database, status: 'confirmed', userId: 'owner-a' })).rejects.toThrow('元の購入プラン')
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/purchases/purchase-bad-source`))).exists()).toBe(false)
    expect((await getDoc(doc(database, 'users/owner-a/bankrollTransactions/stake-purchase-bad-source'))).exists()).toBe(false)
  })
})
