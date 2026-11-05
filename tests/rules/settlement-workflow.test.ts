import fs from 'node:fs'
import path from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
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

function ownerDatabase() {
  return environment.authenticatedContext('owner-a').firestore() as unknown as Firestore
}

describe('purchase/result transactional persistence', () => {
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
    const saved = await saveResult({ activePurchaseIds: ['purchase-0001'], database, payload: resultData(), sourceFileName: 'result.json', userId: 'owner-a' })
    expect(saved.summary).toMatchObject({ netProfitYen: 1_900, returnedYen: 2_400, stakeYen: 500 })
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/results/${saved.resultId}`))).exists()).toBe(true)
    expect((await getDoc(doc(database, `users/owner-a/bankrollTransactions/return-${saved.resultId}`))).data()?.amountYen).toBe(2_400)
  })

  it('records both stake and realized-return deltas when a purchase is corrected after results', async () => {
    const database = ownerDatabase()
    await savePurchase({ data: purchaseData(), database, status: 'confirmed', userId: 'owner-a' })
    await saveResult({ activePurchaseIds: ['purchase-0001'], database, payload: resultData(), sourceFileName: 'result.json', userId: 'owner-a' })
    const correctionId = await correctPurchase({
      data: { items: [{ ...purchaseData().items[0]!, stakeYen: 100 }], memo: '結果後の金額訂正', placedAt: purchaseData().placedAt, raceId },
      database,
      originalPurchaseId: 'purchase-0001',
      userId: 'owner-a',
    })
    expect((await getDoc(doc(database, `users/owner-a/bankrollTransactions/stake-adjust-${correctionId}`))).data()?.amountYen).toBe(-1_520)
  })

  it('does not leave partial documents when source references are invalid', async () => {
    const database = ownerDatabase()
    await expect(savePurchase({ data: { ...purchaseData('purchase-bad-source'), sourcePlanId: 'missing-plan' }, database, status: 'confirmed', userId: 'owner-a' })).rejects.toThrow('元の購入プラン')
    expect((await getDoc(doc(database, `users/owner-a/races/${raceId}/purchases/purchase-bad-source`))).exists()).toBe(false)
    expect((await getDoc(doc(database, 'users/owner-a/bankrollTransactions/stake-purchase-bad-source'))).exists()).toBe(false)
  })
})
