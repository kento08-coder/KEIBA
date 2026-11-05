export const SCENARIO_WEIGHT_TOLERANCE = 1e-6

export interface ConditionalScenarioProbability {
  conditionalHitProbability: number | null
  scenarioId: string
  scenarioProbability: number
}

export interface ScenarioProbabilityContribution {
  conditionalHitProbability: number
  contribution: number
  scenarioId: string
  scenarioProbability: number
}

export type WeightedProbabilityUnavailableReason =
  | 'empty_scenarios'
  | 'missing_conditional_probability'
  | 'invalid_conditional_probability'
  | 'invalid_scenario_probability'
  | 'scenario_probabilities_not_normalized'

export type WeightedProbabilityResult =
  | {
      status: 'calculated'
      contributions: ScenarioProbabilityContribution[]
      probability: number
    }
  | {
      status: 'unavailable'
      reason: WeightedProbabilityUnavailableReason
      scenarioId?: string
    }

function isProbability(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

export function calculateScenarioWeightedProbability(
  scenarios: ConditionalScenarioProbability[],
): WeightedProbabilityResult {
  if (scenarios.length === 0) {
    return { status: 'unavailable', reason: 'empty_scenarios' }
  }

  for (const scenario of scenarios) {
    if (!isProbability(scenario.scenarioProbability)) {
      return {
        status: 'unavailable',
        reason: 'invalid_scenario_probability',
        scenarioId: scenario.scenarioId,
      }
    }
    if (scenario.conditionalHitProbability === null) {
      return {
        status: 'unavailable',
        reason: 'missing_conditional_probability',
        scenarioId: scenario.scenarioId,
      }
    }
    if (!isProbability(scenario.conditionalHitProbability)) {
      return {
        status: 'unavailable',
        reason: 'invalid_conditional_probability',
        scenarioId: scenario.scenarioId,
      }
    }
  }

  const totalScenarioProbability = scenarios.reduce(
    (total, scenario) => total + scenario.scenarioProbability,
    0,
  )
  if (Math.abs(totalScenarioProbability - 1) > SCENARIO_WEIGHT_TOLERANCE) {
    return {
      status: 'unavailable',
      reason: 'scenario_probabilities_not_normalized',
    }
  }

  const contributions = scenarios.map((scenario) => ({
    conditionalHitProbability: scenario.conditionalHitProbability!,
    contribution:
      scenario.scenarioProbability * scenario.conditionalHitProbability!,
    scenarioId: scenario.scenarioId,
    scenarioProbability: scenario.scenarioProbability,
  }))

  return {
    status: 'calculated',
    contributions,
    probability: contributions.reduce(
      (total, contribution) => total + contribution.contribution,
      0,
    ),
  }
}
