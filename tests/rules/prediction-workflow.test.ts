import fs from 'node:fs'
import path from 'node:path'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import type { PredictionDocument } from '../../src/domain/types/import'
import {
  DraftConflictError,
  DuplicatePredictionVersionError,
  finalizePrediction,
  importPredictionDraft,
  savePredictionDraft,
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

async function seedRace() {
  const database = testEnvironment.authenticatedContext(userId).firestore()
  await setDoc(doc(database, `users/${userId}/races/${raceId}`), {
    createdAt: null,
    date: '2026-11-08',
    distanceM: 2000,
    latestPredictionVersionId: null,
    name: 'サンプルステークス',
    organizer: 'JRA',
    raceId,
    raceNumber: 11,
    resultStatus: 'none',
    status: 'registered',
    surface: 'turf',
    updatedAt: null,
    venueCode: 'TOKYO',
  })
  return database as unknown as Firestore
}

describe('prediction draft transactions', () => {
  it('allows only one of two clients saving from the same revision', async () => {
    const database = await seedRace()
    const base = samplePrediction()
    await savePredictionDraft({
      clientId: 'tab-initial',
      database,
      expectedRevision: 0,
      payload: base,
      raceId,
      userId,
    })

    const tabA = structuredClone(base)
    tabA.horses[0]!.rationale = 'タブAの変更'
    const tabB = structuredClone(base)
    tabB.horses[0]!.rationale = 'タブBの変更'
    const results = await Promise.allSettled([
      savePredictionDraft({
        clientId: 'tab-a',
        database,
        expectedRevision: 1,
        payload: tabA,
        raceId,
        userId,
      }),
      savePredictionDraft({
        clientId: 'tab-b',
        database,
        expectedRevision: 1,
        payload: tabB,
        raceId,
        userId,
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected' })

    const draft = await getDoc(
      doc(database, `users/${userId}/races/${raceId}/drafts/current`),
    )
    expect(draft.data()?.revision).toBe(2)
    await expect(
      savePredictionDraft({
        clientId: 'stale-tab',
        database,
        expectedRevision: 1,
        payload: base,
        raceId,
        userId,
      }),
    ).rejects.toBeInstanceOf(DraftConflictError)
  })

  it('rejects finalization when another client saved immediately before it', async () => {
    const database = await seedRace()
    const base = samplePrediction()
    await savePredictionDraft({
      clientId: 'tab-a',
      database,
      expectedRevision: 0,
      payload: base,
      raceId,
      userId,
    })
    const remoteChange = structuredClone(base)
    remoteChange.horses[0]!.rationale = '別端末が先に保存'
    await savePredictionDraft({
      clientId: 'tab-b',
      database,
      expectedRevision: 1,
      payload: remoteChange,
      raceId,
      userId,
    })

    await expect(
      finalizePrediction({
        changeReason: '古いrevisionから確定',
        clientId: 'tab-a',
        database,
        expectedRevision: 1,
        raceId,
        userId,
      }),
    ).rejects.toBeInstanceOf(DraftConflictError)
  })

  it('rejects JSON replacement based on a stale preview revision', async () => {
    const database = await seedRace()
    const base = samplePrediction()
    await savePredictionDraft({
      clientId: 'import-tab',
      database,
      expectedRevision: 0,
      payload: base,
      raceId,
      userId,
    })
    const remoteChange = structuredClone(base)
    remoteChange.horses[0]!.rationale = '確認画面の表示後に別端末が保存'
    await savePredictionDraft({
      clientId: 'remote-tab',
      database,
      expectedRevision: 1,
      payload: remoteChange,
      raceId,
      userId,
    })

    await expect(
      importPredictionDraft({
        clientId: 'import-tab',
        database,
        expectedRevision: 1,
        payload: base,
        raceId,
        sourceFileName: 'prediction.json',
        userId,
      }),
    ).rejects.toBeInstanceOf(DraftConflictError)

    const draft = await getDoc(
      doc(database, `users/${userId}/races/${raceId}/drafts/current`),
    )
    expect(draft.data()?.revision).toBe(2)
    expect(draft.data()?.payload.horses[0].rationale).toBe(
      '確認画面の表示後に別端末が保存',
    )
  })
})

describe('prediction finalization transactions', () => {
  it('creates v1 through v3 but rejects metadata-only duplicate content', async () => {
    const database = await seedRace()
    const first = samplePrediction()
    await savePredictionDraft({
      clientId: 'editor',
      database,
      expectedRevision: 0,
      payload: first,
      raceId,
      userId,
    })
    const v1 = await finalizePrediction({
      changeReason: '初回確定',
      clientId: 'editor',
      database,
      expectedRevision: 1,
      raceId,
      userId,
    })
    expect(v1.versionNumber).toBe(1)

    const metadataOnly = structuredClone(first)
    metadataOnly.generated_at = '2026-11-08T13:00:00+09:00'
    metadataOnly.change_reason = '理由だけ変更'
    await savePredictionDraft({
      clientId: 'editor',
      database,
      expectedRevision: 2,
      payload: metadataOnly,
      raceId,
      userId,
    })
    await expect(
      finalizePrediction({
        changeReason: 'バージョン側の理由も変更',
        clientId: 'editor',
        database,
        expectedRevision: 3,
        raceId,
        userId,
      }),
    ).rejects.toBeInstanceOf(DuplicatePredictionVersionError)

    const second = structuredClone(metadataOnly)
    second.horses[0]!.rationale = 'v2の評価根拠'
    await savePredictionDraft({
      clientId: 'editor',
      database,
      expectedRevision: 3,
      payload: second,
      raceId,
      userId,
    })
    const v2 = await finalizePrediction({
      changeReason: '評価根拠を変更',
      clientId: 'editor',
      database,
      expectedRevision: 4,
      raceId,
      userId,
    })
    expect(v2.versionNumber).toBe(2)

    const third = structuredClone(second)
    third.bet_candidates[0]!.rationale = 'v3の馬券根拠'
    await savePredictionDraft({
      clientId: 'editor',
      database,
      expectedRevision: 5,
      payload: third,
      raceId,
      userId,
    })
    const v3 = await finalizePrediction({
      changeReason: '馬券根拠を変更',
      clientId: 'editor',
      database,
      expectedRevision: 6,
      raceId,
      userId,
    })
    expect(v3.versionNumber).toBe(3)

    const versions = await getDocs(
      collection(database, `users/${userId}/races/${raceId}/predictionVersions`),
    )
    expect(
      versions.docs
        .map((version) => version.data().versionNumber as number)
        .sort(),
    ).toEqual([1, 2, 3])
  })
})
