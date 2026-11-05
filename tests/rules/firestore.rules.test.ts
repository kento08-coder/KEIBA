import fs from 'node:fs'
import path from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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

  it('allows an owner to create and update a race draft', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const raceRef = doc(ownerDb, 'users/owner-a/races/race-1')
    const draftRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/drafts/current',
    )

    await assertSucceeds(setDoc(raceRef, { status: 'predicting' }))
    await assertSucceeds(setDoc(draftRef, { revision: 0 }))
    await assertSucceeds(updateDoc(draftRef, { revision: 1 }))
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
