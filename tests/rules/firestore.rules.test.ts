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
  writeBatch,
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

function validPlanDocument(planId = 'plan-0001') {
  return {
    algorithmVersion: 'phase1-m4-v1',
    allocations: [
      {
        candidateId: 'candidate-1',
        expectedNetProfitYen: 20,
        expectedPayoutYen: 120,
        expectedReturnRatePercent: 120,
        referenceKellyFraction: 0.2,
        stakeYen: 100,
      },
    ],
    assumptions: [],
    authorUid: 'owner-a',
    budgetYen: 1_000,
    candidateSnapshot: [
      {
        betType: 'win',
        candidateId: 'candidate-1',
        confidence: 'high',
        hitProbability: 0.6,
        odds: 2,
        oddsObservedAt: '2026-11-08T12:00:00+09:00',
        probabilitySource: 'ai_estimate',
        rationale: 'Rulesテスト',
        selections: [1],
      },
    ],
    createdAt: serverTimestamp(),
    isSimulation: true,
    memo: '',
    name: 'Rulesテストプラン',
    planId,
    settings: {
      betTypeMode: 'auto',
      budgetYen: 1_000,
      kellyFraction: 0.25,
      lossControlBudgetFraction: 0.3,
      maxSelections: 5,
      maxStakePerBetYen: 500,
      selectedBetTypes: [],
    },
    sourcePredictionVersionId: 'version-1',
    strategy: 'expected_value',
    summary: {
      expectedNetProfitYen: 20,
      expectedPayoutYen: 120,
      expectedReturnRatePercent: 120,
      totalStakeYen: 100,
      unusedBudgetYen: 900,
      worstCaseLossYen: 100,
    },
    warnings: [],
  }
}

function validPurchaseDocument(
  purchaseId: string,
  status: 'draft' | 'confirmed' | 'corrected' = 'confirmed',
) {
  return {
    authorUid: 'owner-a',
    confirmedAt: status === 'draft' ? null : serverTimestamp(),
    correctionOf: null,
    correctionSequence: 0,
    createdAt: serverTimestamp(),
    idempotencyKey: `idempotency-${purchaseId}`,
    items: [{ betType: 'win', itemId: 'item-0001', selections: [1], stakeYen: 100 }],
    memo: '',
    placedAt: '2026-11-08T12:00:00+09:00',
    purchaseId,
    raceId: 'race-1',
    recordedAt: serverTimestamp(),
    revision: 1,
    rootPurchaseId: purchaseId,
    sourcePlanId: null,
    sourcePredictionVersionId: null,
    status,
    totalStakeYen: 100,
    updatedAt: serverTimestamp(),
  }
}

function validResultDocument(resultId = 'result-0001') {
  return {
    activePurchaseIds: [],
    authorUid: 'owner-a',
    confirmedAt: serverTimestamp(),
    contentHash: 'a'.repeat(64),
    correctionOf: null,
    correctionSequence: 0,
    createdAt: serverTimestamp(),
    idempotencyKey: `idempotency-${resultId}`,
    importId: `import-${resultId}`,
    payload: {
      race_id: 'race-1',
      finishers: [{ horse_number: 1 }],
      payouts: [{ bet_type: 'win' }],
    },
    purchaseRevision: 0,
    raceId: 'race-1',
    resultId,
    rootResultId: resultId,
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  }
}

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
      'users/owner-a/races/race-1/plans/plan-0001',
    )
    const intruderPlanRef = doc(
      intruderDb,
      'users/owner-a/races/race-1/plans/plan-0001',
    )
    const anonymousPlanRef = doc(
      anonymousDb,
      'users/owner-a/races/race-1/plans/plan-0001',
    )
    const sourceVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/version-1',
    )

    await assertSucceeds(
      setDoc(sourceVersionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertSucceeds(
      setDoc(ownerPlanRef, validPlanDocument()),
    )
    await assertSucceeds(getDoc(ownerPlanRef))
    await assertFails(updateDoc(ownerPlanRef, { budgetYen: 2_000 }))
    await assertFails(deleteDoc(ownerPlanRef))
    await assertFails(getDoc(intruderPlanRef))
    await assertFails(setDoc(intruderPlanRef, validPlanDocument()))
    await assertFails(getDoc(anonymousPlanRef))
    await assertFails(setDoc(anonymousPlanRef, validPlanDocument()))
  })

  it('rejects a plan with a mismatched id or author', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const sourceVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/version-1',
    )
    const planRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-0001',
    )

    await assertSucceeds(
      setDoc(sourceVersionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertFails(
      setDoc(planRef, {
        ...validPlanDocument(),
        planId: 'different-plan',
      }),
    )
    await assertFails(
      setDoc(planRef, {
        ...validPlanDocument(),
        authorUid: 'owner-b',
      }),
    )
  })

  it('rejects a plan that is not linked to an existing final prediction version', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const planRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-0001',
    )

    await assertFails(
      setDoc(planRef, {
        ...validPlanDocument(),
        sourcePredictionVersionId: 'missing-version',
      }),
    )
  })

  it('rejects malformed plan fields, excessive arrays, and an abnormal budget', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const sourceVersionRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/predictionVersions/version-1',
    )
    const malformedRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-bad-shape',
    )
    const excessiveRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-too-many',
    )
    const budgetRef = doc(
      ownerDb,
      'users/owner-a/races/race-1/plans/plan-bad-budget',
    )

    await assertSucceeds(
      setDoc(sourceVersionRef, { authorUid: 'owner-a', status: 'final' }),
    )
    await assertFails(
      setDoc(malformedRef, {
        ...validPlanDocument('plan-bad-shape'),
        allocations: { candidateId: 'candidate-1' },
        unexpectedField: true,
      }),
    )
    await assertFails(
      setDoc(excessiveRef, {
        ...validPlanDocument('plan-too-many'),
        allocations: Array.from({ length: 51 }, () => ({})),
        candidateSnapshot: Array.from({ length: 51 }, () => ({})),
      }),
    )
    await assertFails(
      setDoc(budgetRef, {
        ...validPlanDocument('plan-bad-budget'),
        budgetYen: 10_000_001,
        settings: {
          ...validPlanDocument().settings,
          budgetYen: 10_000_001,
        },
        summary: {
          ...validPlanDocument().summary,
          unusedBudgetYen: 9_999_901,
        },
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
    const raceRef = doc(ownerDb, 'users/owner-a/races/race-1')

    await assertSucceeds(setDoc(raceRef, {
      activePurchaseIds: [],
      latestPurchaseId: null,
      latestResultId: null,
      purchaseRevision: 0,
      status: 'prediction_confirmed',
    }))
    await assertSucceeds(setDoc(draftRef, validPurchaseDocument('draft-purchase', 'draft')))
    const confirmDraft = writeBatch(ownerDb)
    confirmDraft.set(draftRef, {
      ...validPurchaseDocument('draft-purchase', 'confirmed'),
      revision: 2,
    })
    confirmDraft.update(raceRef, {
      activePurchaseIds: ['draft-purchase'],
      latestPurchaseId: 'draft-purchase',
      purchaseRevision: 1,
    })
    await assertSucceeds(confirmDraft.commit())
    await assertFails(updateDoc(draftRef, { totalStakeYen: 500 }))
    await assertFails(deleteDoc(draftRef))

    await assertFails(setDoc(confirmedRef, validPurchaseDocument('confirmed-purchase')))
    const confirmNew = writeBatch(ownerDb)
    confirmNew.set(confirmedRef, validPurchaseDocument('confirmed-purchase'))
    confirmNew.update(raceRef, {
      activePurchaseIds: ['draft-purchase', 'confirmed-purchase'],
      latestPurchaseId: 'confirmed-purchase',
      purchaseRevision: 2,
    })
    await assertSucceeds(confirmNew.commit())
    await assertFails(updateDoc(confirmedRef, { totalStakeYen: 500 }))
    await assertFails(deleteDoc(confirmedRef))
  })

  it('rejects malformed purchases and invalid purchase amounts', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const malformedRef = doc(ownerDb, 'users/owner-a/races/race-1/purchases/purchase-bad-shape')
    const amountRef = doc(ownerDb, 'users/owner-a/races/race-1/purchases/purchase-bad-amount')

    await assertFails(setDoc(malformedRef, { status: 'confirmed', totalStakeYen: 100 }))
    await assertFails(setDoc(amountRef, {
      ...validPurchaseDocument('purchase-bad-amount'),
      totalStakeYen: 150,
    }))
  })

  it('rejects direct tampering with the race purchase aggregate', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const raceRef = doc(ownerDb, 'users/owner-a/races/race-1')
    await assertSucceeds(setDoc(raceRef, {
      activePurchaseIds: [],
      latestPurchaseId: null,
      purchaseRevision: 0,
      status: 'prediction_confirmed',
    }))

    await assertFails(updateDoc(raceRef, {
      activePurchaseIds: ['missing-purchase'],
      latestPurchaseId: 'missing-purchase',
      purchaseRevision: 1,
    }))
    await assertFails(updateDoc(raceRef, { purchaseRevision: 2 }))
  })

  it('keeps confirmed results immutable and rejects malformed result fields', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const resultRef = doc(ownerDb, 'users/owner-a/races/race-1/results/result-0001')
    const malformedRef = doc(ownerDb, 'users/owner-a/races/race-1/results/result-malformed')

    const raceRef = doc(ownerDb, 'users/owner-a/races/race-1')
    await assertSucceeds(setDoc(raceRef, {
      activePurchaseIds: [],
      latestPurchaseId: null,
      latestResultId: null,
      purchaseRevision: 0,
      status: 'purchased',
    }))
    await assertFails(setDoc(resultRef, validResultDocument()))
    const saveResultBatch = writeBatch(ownerDb)
    saveResultBatch.set(resultRef, validResultDocument())
    saveResultBatch.update(raceRef, { latestResultId: 'result-0001' })
    await assertSucceeds(saveResultBatch.commit())
    await assertFails(updateDoc(resultRef, { contentHash: 'changed' }))
    await assertFails(deleteDoc(resultRef))
    await assertFails(setDoc(malformedRef, {
      ...validResultDocument('result-malformed'),
      payload: { race_id: 'other-race', finishers: [], payouts: [] },
    }))
  })

  it('validates immutable bankroll transactions and their owner', async () => {
    const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore()
    const intruderDb = testEnvironment.authenticatedContext('owner-b').firestore()
    const ledgerRef = doc(ownerDb, 'users/owner-a/bankrollTransactions/stake-purchase-1')
    const intruderRef = doc(intruderDb, 'users/owner-a/bankrollTransactions/stake-purchase-2')
    const transaction = {
      amountYen: -100,
      at: serverTimestamp(),
      authorUid: 'owner-a',
      idempotencyKey: 'stake-purchase-1',
      kind: 'stake',
      note: '購入確定',
      raceId: 'race-1',
      referenceId: 'purchase-1',
      transactionId: 'stake-purchase-1',
    }

    await assertSucceeds(setDoc(ledgerRef, transaction))
    await assertFails(updateDoc(ledgerRef, { amountYen: -500 }))
    await assertFails(deleteDoc(ledgerRef))
    await assertFails(setDoc(intruderRef, { ...transaction, transactionId: 'stake-purchase-2' }))
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
