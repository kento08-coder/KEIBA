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
  PURCHASE_PLAN_MAX_BUDGET_YEN,
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

async function seedPredictionVersion(prediction = samplePrediction()) {
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
      snapshot: prediction,
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

  it('rejects a plan when its probability differs from the final prediction', async () => {
    const data = buildPlan()
    const sourcePrediction = samplePrediction()
    const sourceCandidate = sourcePrediction.bet_candidates.find(
      (candidate) => candidate.id === data.candidateSnapshot[0]?.candidateId,
    )
    expect(sourceCandidate?.hit_probability).not.toBeNull()
    sourceCandidate!.hit_probability = sourceCandidate!.hit_probability! + 0.01
    const database = await seedPredictionVersion(sourcePrediction)

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).rejects.toThrow(/推定的中確率が元の確定予想と一致しません/)
  })

  it('rejects a plan when its odds differ from the final prediction', async () => {
    const data = buildPlan()
    const sourcePrediction = samplePrediction()
    const sourceCandidate = sourcePrediction.bet_candidates.find(
      (candidate) => candidate.id === data.candidateSnapshot[0]?.candidateId,
    )
    expect(sourceCandidate?.odds).not.toBeNull()
    sourceCandidate!.odds = sourceCandidate!.odds! + 0.1
    const database = await seedPredictionVersion(sourcePrediction)

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).rejects.toThrow(/オッズが元の確定予想と一致しません/)
  })

  it('rejects a plan candidate that does not exist in the final prediction', async () => {
    const data = buildPlan()
    const candidateId = data.candidateSnapshot[0]!.candidateId
    const sourcePrediction = samplePrediction()
    sourcePrediction.bet_candidates = sourcePrediction.bet_candidates.filter(
      (candidate) => candidate.id !== candidateId,
    )
    const database = await seedPredictionVersion(sourcePrediction)

    await expect(
      savePurchasePlan({ data, database, raceId, userId }),
    ).rejects.toThrow(/元の確定予想に存在しません/)
  })

  it('rejects an excessive budget, budget overrun, or tampered calculation before saving', async () => {
    const database = await seedPredictionVersion()
    const excessiveBudget = structuredClone(buildPlan())
    excessiveBudget.budgetYen = PURCHASE_PLAN_MAX_BUDGET_YEN + 1
    excessiveBudget.settings.budgetYen = PURCHASE_PLAN_MAX_BUDGET_YEN + 1

    await expect(
      savePurchasePlan({ data: excessiveBudget, database, raceId, userId }),
    ).rejects.toThrow(/10,000,000円以下/)

    const budgetTampered = structuredClone(buildPlan())
    budgetTampered.budgetYen = 100
    budgetTampered.settings.budgetYen = 100

    await expect(
      savePurchasePlan({ data: budgetTampered, database, raceId, userId }),
    ).rejects.toThrow(/予算を超えています/)

    const calculationTampered = structuredClone(buildPlan())
    calculationTampered.allocations[0]!.expectedNetProfitYen += 1

    await expect(
      savePurchasePlan({
        data: calculationTampered,
        database,
        raceId,
        userId,
      }),
    ).rejects.toThrow(/期待値スナップショットが不整合です/)
  })
})
