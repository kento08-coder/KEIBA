import fs from 'node:fs'
import path from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const projectId = 'keiba-rules-test'
let testEnvironment: RulesTestEnvironment

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

describe('Firestore ownership rules', () => {
  it('allows an authenticated owner to read and write inside their user tree', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const profileRef = doc(ownerDb, 'users/owner-a/profile/main')

    await assertSucceeds(setDoc(profileRef, { displayName: 'Owner A' }))
    await assertSucceeds(getDoc(profileRef))
  })

  it('allows sequential draft revisions and rejects stale writes or deletion', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const raceRef = doc(ownerDb, 'users/owner-a/races/race-1')
    const draftRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/drafts/current',
    )

    await assertSucceeds(setDoc(raceRef, { status: 'predicting' }))
    await assertSucceeds(setDoc(draftRef, { revision: 1 }))
    await assertSucceeds(updateDoc(draftRef, { revision: 2 }))
    await assertFails(updateDoc(draftRef, { revision: 4 }))
    await assertFails(updateDoc(draftRef, { payload: { source: 'stale' } }))
    await assertFails(deleteDoc(draftRef))
  })

  it('rejects a draft that does not start at revision one', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const draftRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/drafts/current',
    )

    await assertFails(setDoc(draftRef, { revision: 0 }))
    await assertFails(setDoc(draftRef, { revision: 2 }))
  })

  it('allows final prediction creation but rejects later update and delete', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const versionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/v1',
    )

    await assertSucceeds(
      setDoc(versionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertSucceeds(getDoc(versionRef))
    await assertFails(updateDoc(versionRef, { versionNumber: 2 }))
    await assertFails(deleteDoc(versionRef))
  })

  it('rejects prediction versions that are not final or have another author', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const draftVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/draft',
    )
    const otherAuthorRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/other-author',
    )

    await assertFails(
      setDoc(draftVersionRef, { authorUid: 'owner-a', status: 'draft' }),
    )
    await assertFails(
      setDoc(otherAuthorRef, { authorUid: 'owner-b', status: 'final' }),
    )
  })

  it('allows owners to create and read plans but keeps them immutable and isolated', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const intruderDb = testEnvironment.authenticatedContext('owner-b').firestore()
    const anonymousDb = testEnvironment.unauthenticatedContext().firestore()
    const ownerPlanRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-1',
    )
    const intruderPlanRef = doc(
      intruderDb,
      'users/owner-a/races/race-1/plans/plan-1',
    )
    const anonymousPlanRef = doc(
      anonymousDb,
      'users/owner-a/races/race-1/plans/plan-1',
    )
    const sourceVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/version-1',
    )

    await assertSucceeds(
      setDoc(sourceVersionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertSucceeds(
      setDoc(ownerPlanRef, {
        algorithmVersion: 'phase1-m4-v1',
        authorUid: 'owner-a',
        budgetYen: 1_000,
        createdAt: serverTimestamp(),
        isSimulation: true,
        planId: 'plan-1',
        sourcePredictionVersionId: 'version-1',
        strategy: 'expected_value',
      }),
    )
    await assertSucceeds(getDoc(ownerPlanRef))
    await assertFails(updateDoc(ownerPlanRef, { budgetYen: 2_000 }))
    await assertFails(deleteDoc(ownerPlanRef))
    await assertFails(getDoc(intruderPlanRef))
    await assertFails(setDoc(intruderPlanRef, { planId: 'intruder' }))
    await assertFails(getDoc(anonymousPlanRef))
  })

  it('rejects a plan with a mismatched id or author', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const sourceVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/version-1',
    )
    const planRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-1',
    )
    const validBase = {
      algorithmVersion: 'phase1-m4-v1',
      budgetYen: 1_000,
      createdAt: serverTimestamp(),
      isSimulation: true,
      sourcePredictionVersionId: 'version-1',
      strategy: 'expected_value',
    }

    await assertSucceeds(
      setDoc(sourceVersionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertFails(
      setDoc(planRef, {
        ...validBase,
        authorUid: 'owner-a',
        planId: 'different-plan',
      }),
    )
    await assertFails(
      setDoc(planRef, {
        ...validBase,
        authorUid: 'owner-b',
        planId: 'plan-1',
      }),
    )
  })

  it('rejects a plan that is not linked to an existing final prediction version', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const planRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-1',
    )

    await assertFails(
      setDoc(planRef, {
        algorithmVersion: 'phase1-m4-v1',
        authorUid: 'owner-a',
        budgetYen: 1_000,
        createdAt: serverTimestamp(),
        isSimulation: true,
        planId: 'plan-1',
        sourcePredictionVersionId: 'missing-version',
        strategy: 'expected_value',
      }),
    )
  })

  it('keeps confirmed purchases immutable while allowing a draft to be confirmed', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const draftRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/purchases/draft-purchase',
    )
    const confirmedRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/purchases/confirmed-purchase',
    )

    await assertSucceeds(setDoc(draftRef, { status: 'draft' }))
    await assertSucceeds(updateDoc(draftRef, { status: 'confirmed' }))
    await assertFails(updateDoc(draftRef, { totalStakeYen: 500 }))
    await assertFails(deleteDoc(draftRef))

    await assertSucceeds(setDoc(confirmedRef, { status: 'confirmed' }))
    await assertFails(updateDoc(confirmedRef, { totalStakeYen: 500 }))
    await assertFails(deleteDoc(confirmedRef))
  })

  it('keeps import log records immutable', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const importRef = doc(ownerDb, 'users/owner-a/importLog/import-1')

    await assertSucceeds(setDoc(importRef, { contentHash: 'hash-1' }))
    await assertFails(updateDoc(importRef, { contentHash: 'hash-2' }))
    await assertFails(deleteDoc(importRef))
  })

  it('denies access to another user tree', async () => {
    const intruderDb = testEnvironment
      .authenticatedContext('owner-b')
      .firestore()
    const otherProfileRef = doc(
      intruderDb,
      'users/owner-a/profile/main',
    )

    await assertFails(getDoc(otherProfileRef))
    await assertFails(setDoc(otherProfileRef, { displayName: 'Changed' }))
  })

  it('denies unauthenticated access', async () => {
    const anonymousDb = testEnvironment.unauthenticatedContext().firestore()
    const profileRef = doc(anonymousDb, 'users/owner-a/profile/main')

    await assertFails(getDoc(profileRef))
    await assertFails(setDoc(profileRef, { displayName: 'Anonymous' }))
  })

  it('denies authenticated access outside the users collection', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const publicRef = doc(ownerDb, 'public/config')

    await assertFails(getDoc(publicRef))
    await assertFails(setDoc(publicRef, { enabled: true }))
  })

  it('denies undeclared collections inside the owner user tree', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const unknownRef = doc(ownerDb, 'users/owner-a/unknown/document')

    await assertFails(getDoc(unknownRef))
    await assertFails(setDoc(unknownRef, { enabled: true }))
  })
})
