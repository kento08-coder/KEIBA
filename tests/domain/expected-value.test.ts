import {
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
      oddsConfirmed: true,
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
        oddsConfirmed: true,
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

  it('distinguishes probability zero from an unset probability', () => {
    const zero = calculateExpectedValue({
      odds: 3,
      oddsConfirmed: true,
      probability: 0,
      stakeYen: 100,
    })
    const unset = calculateExpectedValue({
      odds: 3,
      oddsConfirmed: true,
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
      oddsConfirmed: true,
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
      oddsConfirmed: true,
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
      input: { probability: null, odds: 2, oddsConfirmed: true, stakeYen: 100 },
      reason: 'missing_probability',
    },
    {
      input: { probability: 0.5, odds: null, oddsConfirmed: false, stakeYen: 100 },
      reason: 'missing_odds',
    },
    {
      input: { probability: 0.5, odds: 2, oddsConfirmed: false, stakeYen: 100 },
      reason: 'unconfirmed_odds',
    },
    {
      input: { probability: -0.1, odds: 2, oddsConfirmed: true, stakeYen: 100 },
      reason: 'invalid_probability',
    },
    {
      input: { probability: 1.1, odds: 2, oddsConfirmed: true, stakeYen: 100 },
      reason: 'invalid_probability',
    },
    {
      input: { probability: 0.5, odds: 0.99, oddsConfirmed: true, stakeYen: 100 },
      reason: 'invalid_odds',
    },
    {
      input: { probability: 0.5, odds: Number.NaN, oddsConfirmed: true, stakeYen: 100 },
      reason: 'invalid_odds',
    },
    {
      input: { probability: 0.5, odds: 2, oddsConfirmed: true, stakeYen: -1 },
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
      oddsConfirmed: true,
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
