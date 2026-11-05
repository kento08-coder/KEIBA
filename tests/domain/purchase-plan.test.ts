import {
  buildPurchasePlanWriteData,
  findSelectionOverlaps,
  generatePurchasePlan,
  generatePurchasePlans,
  PURCHASE_PLAN_ALGORITHM_VERSION,
  recalculatePlanAllocations,
  validatePurchasePlanWriteData,
} from '../../src/domain/calculations/purchase-plan'
import type { BetCandidate } from '../../src/domain/types/import'
import type { PurchasePlanSettings } from '../../src/domain/types/purchase-plan'

function candidate(overrides: Partial<BetCandidate> = {}): BetCandidate {
  return {
    bet_type: 'win',
    confidence: 'high',
    hit_probability: 0.6,
    horse_numbers: [1],
    id: 'candidate-1',
    odds: 2,
    odds_observed_at: '2026-11-08T12:00:00+09:00',
    probability_source: 'ai_estimate',
    rationale: '架空のテスト候補',
    ...overrides,
  }
}

function settings(overrides: Partial<PurchasePlanSettings> = {}): PurchasePlanSettings {
  return {
    betTypeMode: 'auto',
    budgetYen: 1_000,
    kellyFraction: 0.25,
    lossControlBudgetFraction: 0.3,
    maxSelections: 5,
    maxStakePerBetYen: 2_000,
    selectedBetTypes: [],
    ...overrides,
  }
}

const positiveCandidates = [
  candidate({ id: 'win-1', horse_numbers: [1], hit_probability: 0.6, odds: 2 }),
  candidate({
    bet_type: 'quinella',
    id: 'quinella-2-3',
    horse_numbers: [2, 3],
    hit_probability: 0.3,
    odds: 4,
  }),
  candidate({
    bet_type: 'wide',
    id: 'wide-4-5',
    horse_numbers: [4, 5],
    hit_probability: 0.4,
    odds: 3,
  }),
]

describe('purchase plan generation', () => {
  it.each([500, 1_000, 2_000])(
    'respects a %i yen budget and 100-yen purchase units',
    (budgetYen) => {
      const plan = generatePurchasePlan({
        candidates: positiveCandidates,
        settings: settings({ budgetYen }),
        strategy: 'expected_value',
      })

      expect(plan.summary.totalStakeYen).toBe(budgetYen)
      expect(plan.summary.totalStakeYen).toBeLessThanOrEqual(budgetYen)
      expect(
        plan.allocations.every(
          (allocation) => allocation.stakeYen % 100 === 0,
        ),
      ).toBe(true)
    },
  )

  it('allows an arbitrary budget remainder to stay unused', () => {
    const plan = generatePurchasePlan({
      candidates: positiveCandidates,
      settings: settings({ budgetYen: 550 }),
      strategy: 'expected_value',
    })

    expect(plan.summary.totalStakeYen).toBe(500)
    expect(plan.summary.unusedBudgetYen).toBe(50)
  })

  it('leaves budget unused when point and per-bet caps are reached', () => {
    const plan = generatePurchasePlan({
      candidates: positiveCandidates,
      settings: settings({
        budgetYen: 2_000,
        maxSelections: 2,
        maxStakePerBetYen: 300,
      }),
      strategy: 'expected_value',
    })

    expect(plan.allocations).toHaveLength(2)
    expect(plan.summary.totalStakeYen).toBe(600)
    expect(plan.summary.unusedBudgetYen).toBe(1_400)
  })

  it('returns a pass plan when no positive expected-value candidate exists', () => {
    const plan = generatePurchasePlan({
      candidates: [candidate({ hit_probability: 0.4, odds: 2 })],
      settings: settings(),
      strategy: 'expected_value',
    })

    expect(plan.allocations).toEqual([])
    expect(plan.summary.totalStakeYen).toBe(0)
    expect(plan.warnings.join(' ')).toContain('見送り')
  })

  it('does not allocate when every candidate is uncalculated', () => {
    const plan = generatePurchasePlan({
      candidates: [
        candidate({
          hit_probability: null,
          probability_source: 'unset',
        }),
        candidate({
          id: 'missing-odds',
          odds: null,
          odds_observed_at: null,
        }),
      ],
      settings: settings(),
      strategy: 'expected_value',
    })

    expect(plan.allocations).toEqual([])
    expect(plan.warnings.join(' ')).toContain('未算出')
  })

  it.each([
    { hitProbability: 1, odds: 1 },
    { hitProbability: 0, odds: 50 },
  ])(
    'excludes the non-positive boundary p=$hitProbability O=$odds',
    ({ hitProbability, odds }) => {
      const plans = generatePurchasePlans(
        [candidate({ hit_probability: hitProbability, odds })],
        settings(),
      )
      expect(plans.every((plan) => plan.allocations.length === 0)).toBe(true)
    },
  )

  it('uses a conservative Kelly fraction, floors to 100 yen, and rejects O=1', () => {
    const plan = generatePurchasePlan({
      candidates: [
        candidate({ id: 'kelly', hit_probability: 0.8, odds: 2 }),
        candidate({ id: 'odds-one', hit_probability: 1, odds: 1 }),
      ],
      settings: settings({ budgetYen: 1_000, kellyFraction: 0.25 }),
      strategy: 'fractional_kelly',
    })

    expect(plan.allocations).toEqual([
      expect.objectContaining({
        candidateId: 'kelly',
        referenceKellyFraction: 0.6000000000000001,
        stakeYen: 100,
      }),
    ])
  })

  it('excludes low-confidence candidates from loss control', () => {
    const plan = generatePurchasePlan({
      candidates: [
        candidate({ confidence: 'low', id: 'low', horse_numbers: [1] }),
        candidate({ confidence: 'medium', id: 'medium', horse_numbers: [2] }),
      ],
      settings: settings({ budgetYen: 1_000 }),
      strategy: 'loss_control',
    })

    expect(plan.allocations.map((allocation) => allocation.candidateId)).toEqual([
      'medium',
    ])
    expect(plan.summary.totalStakeYen).toBe(300)
  })

  it('deduplicates the same bet type and selection', () => {
    const plan = generatePurchasePlan({
      candidates: [
        candidate({ id: 'first' }),
        candidate({ id: 'duplicate' }),
      ],
      settings: settings({ budgetYen: 500 }),
      strategy: 'expected_value',
    })

    expect(plan.allocations).toHaveLength(1)
    expect(plan.allocations[0]?.candidateId).toBe('first')
  })

  it('keeps a calculated duplicate when an earlier matching candidate is uncalculated', () => {
    const plan = generatePurchasePlan({
      candidates: [
        candidate({
          hit_probability: null,
          id: 'uncalculated',
          probability_source: 'unset',
        }),
        candidate({ id: 'calculated' }),
      ],
      settings: settings({ budgetYen: 500 }),
      strategy: 'expected_value',
    })

    expect(plan.allocations).toHaveLength(1)
    expect(plan.allocations[0]?.candidateId).toBe('calculated')
  })

  it('is deterministic for the same inputs', () => {
    const first = generatePurchasePlans(positiveCandidates, settings())
    const second = generatePurchasePlans(positiveCandidates, settings())
    expect(second).toEqual(first)
  })
})

describe('manual plan adjustment', () => {
  it('recalculates totals after changing stakes', () => {
    const result = recalculatePlanAllocations({
      allocations: [
        { candidateId: 'win-1', stakeYen: 200 },
        { candidateId: 'quinella-2-3', stakeYen: 300 },
      ],
      candidates: positiveCandidates,
      settings: settings({ budgetYen: 1_000 }),
    })

    expect(result.errors).toEqual([])
    expect(result.summary.totalStakeYen).toBe(500)
    expect(result.summary.unusedBudgetYen).toBe(500)
    expect(result.summary.expectedNetProfitYen).toBeCloseTo(100)
  })

  it('rejects non-100-yen amounts, duplicate selections, and budget overflow', () => {
    const invalidUnit = recalculatePlanAllocations({
      allocations: [{ candidateId: 'win-1', stakeYen: 150 }],
      candidates: positiveCandidates,
      settings: settings(),
    })
    expect(invalidUnit.errors.join(' ')).toContain('100円単位')

    const duplicate = recalculatePlanAllocations({
      allocations: [
        { candidateId: 'win-1', stakeYen: 100 },
        { candidateId: 'win-1', stakeYen: 100 },
      ],
      candidates: positiveCandidates,
      settings: settings(),
    })
    expect(duplicate.errors.join(' ')).toContain('重複')

    const duplicateBet = recalculatePlanAllocations({
      allocations: [
        { candidateId: 'first', stakeYen: 100 },
        { candidateId: 'duplicate', stakeYen: 100 },
      ],
      candidates: [
        candidate({ id: 'first' }),
        candidate({ id: 'duplicate' }),
      ],
      settings: settings(),
    })
    expect(duplicateBet.errors.join(' ')).toContain('同じ券種・番号組')

    const overflow = recalculatePlanAllocations({
      allocations: [
        { candidateId: 'win-1', stakeYen: 600 },
        { candidateId: 'quinella-2-3', stakeYen: 500 },
      ],
      candidates: positiveCandidates,
      settings: settings({ budgetYen: 1_000 }),
    })
    expect(overflow.errors.join(' ')).toContain('予算を超え')
  })

  it('reports shared horse numbers without claiming a correlation coefficient', () => {
    const overlaps = findSelectionOverlaps([
      {
        betType: 'win',
        candidateId: 'win-1',
        confidence: 'high',
        hitProbability: 0.6,
        odds: 2,
        oddsObservedAt: '2026-11-08T12:00:00+09:00',
        probabilitySource: 'ai_estimate',
        rationale: 'test',
        selections: [1],
      },
      {
        betType: 'exacta',
        candidateId: 'exacta-1-2',
        confidence: 'high',
        hitProbability: 0.2,
        odds: 6,
        oddsObservedAt: '2026-11-08T12:00:00+09:00',
        probabilitySource: 'ai_estimate',
        rationale: 'test',
        selections: [1, 2],
      },
    ])
    expect(overlaps).toEqual([
      {
        leftCandidateId: 'win-1',
        rightCandidateId: 'exacta-1-2',
        selectionKind: 'horse',
        sharedNumbers: [1],
      },
    ])
  })

  it('builds an immutable save snapshot linked to the prediction version', () => {
    const plan = generatePurchasePlan({
      candidates: positiveCandidates,
      settings: settings({ budgetYen: 500 }),
      strategy: 'expected_value',
    })
    const snapshot = buildPurchasePlanWriteData({
      authorUid: 'owner-a',
      memo: '保存テスト',
      name: 'テストプラン',
      plan,
      planId: 'plan-test-0001',
      sourcePredictionVersionId: 'version-1',
    })

    expect(snapshot).toMatchObject({
      algorithmVersion: PURCHASE_PLAN_ALGORITHM_VERSION,
      authorUid: 'owner-a',
      budgetYen: 500,
      isSimulation: true,
      memo: '保存テスト',
      name: 'テストプラン',
      planId: 'plan-test-0001',
      sourcePredictionVersionId: 'version-1',
    })
    expect(snapshot.candidateSnapshot).toHaveLength(snapshot.allocations.length)
  })

  it('rejects tampered save totals and allocation calculations', () => {
    const plan = generatePurchasePlan({
      candidates: positiveCandidates,
      settings: settings({ budgetYen: 500 }),
      strategy: 'expected_value',
    })
    const snapshot = buildPurchasePlanWriteData({
      authorUid: 'owner-a',
      memo: '',
      name: '整合性テスト',
      plan,
      planId: 'plan-test-0002',
      sourcePredictionVersionId: 'version-1',
    })
    const tampered = structuredClone(snapshot)
    tampered.summary.totalStakeYen += 100
    tampered.allocations[0]!.expectedNetProfitYen += 1

    expect(validatePurchasePlanWriteData(tampered).join(' ')).toContain(
      '不整合',
    )
    expect(validatePurchasePlanWriteData(tampered).join(' ')).toContain(
      '集計値',
    )
  })
})
