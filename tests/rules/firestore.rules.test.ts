import fs from 'node:fs'
import path from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

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
})
