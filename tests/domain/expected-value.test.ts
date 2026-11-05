import {
  EXPECTED_RETURN_MULTIPLIER_TOLERANCE,
  calculateExpectedValue,
  calculateExpectedValueRange,
  evaluateBetCandidate,
  rankBetCandidatesByExpectedReturn,
} from '../../src/domain/calculations/expected-value'
import type { BetCandidate, BetType } from '../../src/domain/types/import'

function candidate(overrides: Partial<BetCandidate> = {}): BetCandidate {
  return {
    bet_type: 'win',
    confidence: 'medium',
    hit_probability: 0.6,
    horse_numbers: [1],
    id: 'candidate',
    odds: 2,
    odds_observed_at: '2026-11-08T12:00:00+09:00',
    probability_source: 'ai_estimate',
    rationale: 'テスト用の架空候補',
    ...overrides,
  }
}

describe('expected value calculation', () => {
  it.each<[BetType, number[]]>([
    ['win', [1]],
    ['place', [1]],
    ['bracket_quinella', [1, 1]],
    ['quinella', [1, 2]],
    ['wide', [1, 2]],
    ['exacta', [2, 1]],
    ['trio', [1, 2, 3]],
    ['trifecta', [3, 2, 1]],
  ])('calculates %s without changing its stored selection order', (betType, selections) => {
    const input = candidate({ bet_type: betType, horse_numbers: selections })
    const result = evaluateBetCandidate(input)

    expect(result.status).toBe('calculated')
    expect(input.horse_numbers).toEqual(selections)
  })

  it('calculates the exact 100 percent break-even boundary', () => {
    const result = calculateExpectedValue({
      odds: 4,
      oddsObserved: true,
      probability: 0.25,
      stakeYen: 100,
    })

    expect(result).toEqual({
      status: 'calculated',
      metrics: {
        breakEvenProbability: 0.25,
        classification: 'break_even',
        expectedNetProfitYen: 0,
        expectedPayoutYen: 100,
        expectedReturnRatePercent: 100,
        probabilityEdge: 0,
      },
    })
  })

  it.each([
    { probability: 0.6, expectedProfit: 20, classification: 'positive' },
    { probability: 0.5, expectedProfit: 0, classification: 'break_even' },
    { probability: 0.4, expectedProfit: -20, classification: 'negative' },
  ] as const)(
    'classifies $classification expected profit',
    ({ probability, expectedProfit, classification }) => {
      const result = calculateExpectedValue({
        odds: 2,
        oddsObserved: true,
        probability,
        stakeYen: 100,
      })
      expect(result.status).toBe('calculated')
      if (result.status === 'calculated') {
        expect(result.metrics.expectedNetProfitYen).toBeCloseTo(expectedProfit)
        expect(result.metrics.classification).toBe(classification)
      }
    },
  )

  it.each([
    {
      classification: 'positive',
      odds: 2.2,
      probability: 0.5,
    },
    {
      classification: 'break_even',
      odds: 2,
      probability: 0.5,
    },
    {
      classification: 'negative',
      odds: 1.8,
      probability: 0.5,
    },
  ] as const)(
    'classifies a zero-yen stake as $classification from its expected return multiplier',
    ({ classification, odds, probability }) => {
      const result = calculateExpectedValue({
        odds,
        oddsObserved: true,
        probability,
        stakeYen: 0,
      })

      expect(result.status).toBe('calculated')
      if (result.status === 'calculated') {
        expect(result.metrics.classification).toBe(classification)
        expect(result.metrics.expectedNetProfitYen).toBe(0)
      }
    },
  )

  it('treats floating-point noise around 100 percent as break-even', () => {
    const result = calculateExpectedValue({
      odds: 10 / 3,
      oddsObserved: true,
      probability: 0.1 + 0.2,
      stakeYen: 100,
    })

    expect(result.status).toBe('calculated')
    if (result.status === 'calculated') {
      expect(
        Math.abs(result.metrics.expectedReturnRatePercent - 100),
      ).toBeLessThanOrEqual(EXPECTED_RETURN_MULTIPLIER_TOLERANCE * 100)
      expect(result.metrics.classification).toBe('break_even')
    }
  })

  it.each([
    {
      classification: 'positive',
      odds: 2 + EXPECTED_RETURN_MULTIPLIER_TOLERANCE * 4,
    },
    {
      classification: 'negative',
      odds: 2 - EXPECTED_RETURN_MULTIPLIER_TOLERANCE * 4,
    },
  ] as const)(
    'classifies values beyond the tolerance as $classification',
    ({ classification, odds }) => {
      const result = calculateExpectedValue({
        odds,
        oddsObserved: true,
        probability: 0.5,
        stakeYen: 0,
      })

      expect(result).toMatchObject({
        status: 'calculated',
        metrics: { classification },
      })
    },
  )

  it('distinguishes probability zero from an unset probability', () => {
    const zero = calculateExpectedValue({
      odds: 3,
      oddsObserved: true,
      probability: 0,
      stakeYen: 100,
    })
    const unset = calculateExpectedValue({
      odds: 3,
      oddsObserved: true,
      probability: null,
      stakeYen: 100,
    })

    expect(zero).toMatchObject({
      status: 'calculated',
      metrics: { expectedNetProfitYen: -100, expectedPayoutYen: 0 },
    })
    expect(unset).toEqual({
      status: 'unavailable',
      reason: 'missing_probability',
    })
  })

  it('supports probability one and odds 1.0', () => {
    const result = calculateExpectedValue({
      odds: 1,
      oddsObserved: true,
      probability: 1,
      stakeYen: 500,
    })

    expect(result).toMatchObject({
      status: 'calculated',
      metrics: {
        breakEvenProbability: 1,
        expectedNetProfitYen: 0,
        expectedPayoutYen: 500,
        expectedReturnRatePercent: 100,
      },
    })
  })

  it.each([100, 500, 1_000])('calculates stake %i without early rounding', (stakeYen) => {
    const result = calculateExpectedValue({
      odds: 2.35,
      oddsObserved: true,
      probability: 0.47,
      stakeYen,
    })
    expect(result.status).toBe('calculated')
    if (result.status === 'calculated') {
      expect(result.metrics.expectedPayoutYen).toBe(0.47 * 2.35 * stakeYen)
      expect(result.metrics.expectedNetProfitYen).toBe(
        0.47 * 2.35 * stakeYen - stakeYen,
      )
    }
  })

  it.each([
    {
      input: { probability: null, odds: 2, oddsObserved: true, stakeYen: 100 },
      reason: 'missing_probability',
    },
    {
      input: { probability: 0.5, odds: null, oddsObserved: false, stakeYen: 100 },
      reason: 'missing_odds',
    },
    {
      input: { probability: 0.5, odds: 2, oddsObserved: false, stakeYen: 100 },
      reason: 'missing_odds_observation',
    },
    {
      input: { probability: -0.1, odds: 2, oddsObserved: true, stakeYen: 100 },
      reason: 'invalid_probability',
    },
    {
      input: { probability: 1.1, odds: 2, oddsObserved: true, stakeYen: 100 },
      reason: 'invalid_probability',
    },
    {
      input: { probability: 0.5, odds: 0.99, oddsObserved: true, stakeYen: 100 },
      reason: 'invalid_odds',
    },
    {
      input: { probability: 0.5, odds: Number.NaN, oddsObserved: true, stakeYen: 100 },
      reason: 'invalid_odds',
    },
    {
      input: { probability: 0.5, odds: 2, oddsObserved: true, stakeYen: -1 },
      reason: 'invalid_stake',
    },
  ] as const)('rejects unavailable or invalid input: $reason', ({ input, reason }) => {
    expect(calculateExpectedValue(input)).toEqual({
      status: 'unavailable',
      reason,
    })
  })

  it('keeps odds ranges as lower and upper calculations', () => {
    const result = calculateExpectedValueRange({
      oddsObserved: true,
      oddsRange: { lower: 1.8, upper: 2.4 },
      probability: 0.5,
      stakeYen: 100,
    })

    expect(result).toMatchObject({
      status: 'calculated_range',
      lower: { expectedReturnRatePercent: 90 },
      upper: { expectedReturnRatePercent: 120 },
    })
  })
})

describe('expected value ranking', () => {
  it('sorts calculated candidates by expected return and keeps uncalculated last', () => {
    const ranked = rankBetCandidatesByExpectedReturn([
      candidate({ id: 'middle', hit_probability: 0.5, odds: 2 }),
      candidate({ id: 'missing', hit_probability: null, probability_source: 'unset' }),
      candidate({ id: 'highest', hit_probability: 0.4, odds: 4 }),
      candidate({ id: 'lowest', hit_probability: 0.2, odds: 2 }),
    ])

    expect(ranked.map((entry) => entry.candidate.id)).toEqual([
      'highest',
      'middle',
      'lowest',
      'missing',
    ])
    expect(ranked.at(-1)?.evaluation.status).toBe('unavailable')
  })
})
