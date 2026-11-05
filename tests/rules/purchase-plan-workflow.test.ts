import fs from 'node:fs'
import path from 'node:path'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import {
  buildPurchasePlanWriteData,
  generatePurchasePlan,
} from '../../src/domain/calculations/purchase-plan'
import type { PredictionDocument } from '../../src/domain/types/import'
import type { PurchasePlanSettings } from '../../src/domain/types/purchase-plan'
import {
  DuplicatePurchasePlanError,
  RepositoryError,
  savePurchasePlan,
} from '../../src/infrastructure/repositories/race-repository'

const projectId = 'keiba-rules-test'
const raceId = '2026-11-08-TOKYO-11-JRA'
const userId = 'owner-a'
let testEnvironment: RulesTestEnvironment

function samplePrediction() {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples/prediction.sample.json'), 'utf8'),
  ) as PredictionDocument
}

function planSettings(): PurchasePlanSettings {
  return {
    betTypeMode: 'auto',
    budgetYen: 1_000,
    kellyFraction: 0.25,
    lossControlBudgetFraction: 0.3,
    maxSelections: 5,
    maxStakePerBetYen: 500,
    selectedBetTypes: [],
  }
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

async function seedPredictionVersion() {
  const database = testEnvironment.authenticatedContext(userId).firestore()
  await setDoc(doc(database, `users/${userId}/races/${raceId}`), {
    raceId,
    status: 'prediction_confirmed',
  })
  await setDoc(
    doc(
      database,
      `users/${userId}/races/${raceId}/predictionVersions/version-1`,
    ),
    {
      authorUid: userId,
      snapshot: samplePrediction(),
      status: 'final',
      versionNumber: 1,
    },
  )
  return database as unknown as Firestore
}

function buildPlan() {
  const prediction = samplePrediction()
  const plan = generatePurchasePlan({
    candidates: prediction.bet_candidates,
    settings: planSettings(),
    strategy: 'expected_value',
  })
  return buildPurchasePlanWriteData({
    authorUid: userId,
    memo: 'Emulator保存テスト',
    name: '保存プラン',
    plan,
    planId: 'plan-emulator-0001',
    sourcePredictionVersionId: 'version-1',
  })
}

describe('purchase plan persistence', () => {
  it('saves a snapshot linked to an existing final prediction version', async () => {
    const database = await seedPredictionVersion()
    const data = buildPlan()

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).resolves.toBe(data.planId)

    const saved = await getDoc(
      doc(database, `users/${userId}/races/${raceId}/plans/${data.planId}`),
    )
    expect(saved.data()).toMatchObject({
      algorithmVersion: 'phase1-m4-v1',
      authorUid: userId,
      planId: data.planId,
      sourcePredictionVersionId: 'version-1',
    })
    expect(saved.data()?.createdAt).toBeDefined()
  })

  it('rejects a retry with the same plan id', async () => {
    const database = await seedPredictionVersion()
    const data = buildPlan()
    await savePurchasePlan({ data, database, raceId, userId })

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).rejects.toBeInstanceOf(DuplicatePurchasePlanError)
  })

  it('rejects a plan whose source prediction version does not exist', async () => {
    const database = await seedPredictionVersion()
    const data = {
      ...buildPlan(),
      planId: 'plan-missing-source',
      sourcePredictionVersionId: 'missing-version',
    }

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).rejects.toBeInstanceOf(RepositoryError)
  })
})
