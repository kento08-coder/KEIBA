import { calculateScenarioWeightedProbability } from '../../src/domain/calculations/scenario-weighting'

describe('scenario weighted probability', () => {
  it('calculates the weighted probability without rounding contributions', () => {
    const result = calculateScenarioWeightedProbability([
      {
        conditionalHitProbability: 0.2,
        scenarioId: 'slow',
        scenarioProbability: 0.25,
      },
      {
        conditionalHitProbability: 0.4,
        scenarioId: 'middle',
        scenarioProbability: 0.5,
      },
      {
        conditionalHitProbability: 0.6,
        scenarioId: 'high',
        scenarioProbability: 0.25,
      },
    ])

    expect(result.status).toBe('calculated')
    if (result.status === 'calculated') {
      expect(result.probability).toBe(0.4)
      expect(result.contributions.map((entry) => entry.contribution)).toEqual([
        0.05, 0.2, 0.15,
      ])
    }
  })

  it('rejects missing conditional probabilities instead of inferring them', () => {
    expect(
      calculateScenarioWeightedProbability([
        {
          conditionalHitProbability: null,
          scenarioId: 'slow',
          scenarioProbability: 1,
        },
      ]),
    ).toEqual({
      status: 'unavailable',
      reason: 'missing_conditional_probability',
      scenarioId: 'slow',
    })
  })

  it('accepts a conditional probability of zero', () => {
    expect(
      calculateScenarioWeightedProbability([
        {
          conditionalHitProbability: 0,
          scenarioId: 'slow',
          scenarioProbability: 1,
        },
      ]),
    ).toMatchObject({ status: 'calculated', probability: 0 })
  })

  it('rejects invalid or unnormalized scenario probabilities', () => {
    expect(
      calculateScenarioWeightedProbability([
        {
          conditionalHitProbability: 0.5,
          scenarioId: 'invalid',
          scenarioProbability: 1.1,
        },
      ]),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_scenario_probability',
    })

    expect(
      calculateScenarioWeightedProbability([
        {
          conditionalHitProbability: 0.5,
          scenarioId: 'slow',
          scenarioProbability: 0.4,
        },
        {
          conditionalHitProbability: 0.5,
          scenarioId: 'high',
          scenarioProbability: 0.4,
        },
      ]),
    ).toEqual({
      status: 'unavailable',
      reason: 'scenario_probabilities_not_normalized',
    })
  })
})
