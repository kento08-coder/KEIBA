import type { BetCandidate, BetType } from '../types/import'

export const betTypeLabels: Record<BetType, string> = {
  win: '単勝',
  place: '複勝',
  bracket_quinella: '枠連',
  quinella: '馬連',
  wide: 'ワイド',
  exacta: '馬単',
  trio: '三連複',
  trifecta: '三連単',
}

export const EXPECTED_RETURN_MULTIPLIER_TOLERANCE = 1e-12

export type ExpectedValueClassification = 'positive' | 'break_even' | 'negative'
export type ExpectedValueUnavailableReason =
  | 'missing_probability'
  | 'missing_odds'
  | 'missing_odds_observation'
  | 'invalid_probability'
  | 'invalid_odds'
  | 'invalid_odds_range'
  | 'invalid_stake'

export const expectedValueUnavailableLabels: Record<
  ExpectedValueUnavailableReason,
  string
> = {
  missing_probability: '推定的中確率が未設定です。',
  missing_odds: 'オッズが未設定です。',
  missing_odds_observation:
    'オッズが記録済みでも観測日時がないため、期待値を算出できません。',
  invalid_probability: '推定的中確率が0〜1の範囲外です。',
  invalid_odds: 'オッズが1.0未満、または有限値ではありません。',
  invalid_odds_range: 'オッズ範囲の上下限が不正です。',
  invalid_stake: '購入予定金額が0円未満、または有限値ではありません。',
}

export interface ExpectedValueMetrics {
  breakEvenProbability: number
  classification: ExpectedValueClassification
  expectedNetProfitYen: number
  expectedPayoutYen: number
  expectedReturnRatePercent: number
  probabilityEdge: number
}

export type ExpectedValueResult =
  | { status: 'calculated'; metrics: ExpectedValueMetrics }
  | { status: 'unavailable'; reason: ExpectedValueUnavailableReason }

export interface ExpectedValueInput {
  odds: number | null
  oddsObserved: boolean
  probability: number | null
  stakeYen: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function calculateExpectedValue(
  input: ExpectedValueInput,
): ExpectedValueResult {
  if (!isFiniteNumber(input.stakeYen) || input.stakeYen < 0) {
    return { status: 'unavailable', reason: 'invalid_stake' }
  }
  if (input.probability === null) {
    return { status: 'unavailable', reason: 'missing_probability' }
  }
  if (
    !isFiniteNumber(input.probability) ||
    input.probability < 0 ||
    input.probability > 1
  ) {
    return { status: 'unavailable', reason: 'invalid_probability' }
  }
  if (input.odds === null) {
    return { status: 'unavailable', reason: 'missing_odds' }
  }
  if (!isFiniteNumber(input.odds) || input.odds < 1) {
    return { status: 'unavailable', reason: 'invalid_odds' }
  }
  if (!input.oddsObserved) {
    return { status: 'unavailable', reason: 'missing_odds_observation' }
  }

  const expectedReturnMultiplier = input.probability * input.odds
  const expectedPayoutYen = expectedReturnMultiplier * input.stakeYen
  const expectedNetProfitYen = expectedPayoutYen - input.stakeYen
  const distanceFromBreakEven = expectedReturnMultiplier - 1
  const classification =
    Math.abs(distanceFromBreakEven) <= EXPECTED_RETURN_MULTIPLIER_TOLERANCE
      ? 'break_even'
      : distanceFromBreakEven > 0
        ? 'positive'
        : 'negative'

  return {
    status: 'calculated',
    metrics: {
      breakEvenProbability: 1 / input.odds,
      classification,
      expectedNetProfitYen,
      expectedPayoutYen,
      expectedReturnRatePercent: expectedReturnMultiplier * 100,
      probabilityEdge: input.probability - 1 / input.odds,
    },
  }
}

export interface OddsRange {
  lower: number
  upper: number
}

export type ExpectedValueRangeResult =
  | {
      status: 'calculated_range'
      lower: ExpectedValueMetrics
      upper: ExpectedValueMetrics
    }
  | { status: 'unavailable'; reason: ExpectedValueUnavailableReason }

export function calculateExpectedValueRange(input: {
  oddsObserved: boolean
  oddsRange: OddsRange | null
  probability: number | null
  stakeYen: number
}): ExpectedValueRangeResult {
  if (input.oddsRange === null) {
    return { status: 'unavailable', reason: 'missing_odds' }
  }
  if (
    !isFiniteNumber(input.oddsRange.lower) ||
    !isFiniteNumber(input.oddsRange.upper) ||
    input.oddsRange.lower < 1 ||
    input.oddsRange.upper < input.oddsRange.lower
  ) {
    return { status: 'unavailable', reason: 'invalid_odds_range' }
  }

  const lower = calculateExpectedValue({
    odds: input.oddsRange.lower,
    oddsObserved: input.oddsObserved,
    probability: input.probability,
    stakeYen: input.stakeYen,
  })
  if (lower.status === 'unavailable') {
    return lower
  }
  const upper = calculateExpectedValue({
    odds: input.oddsRange.upper,
    oddsObserved: input.oddsObserved,
    probability: input.probability,
    stakeYen: input.stakeYen,
  })
  if (upper.status === 'unavailable') {
    return upper
  }
  return {
    status: 'calculated_range',
    lower: lower.metrics,
    upper: upper.metrics,
  }
}

export interface BetCandidateExpectedValue {
  candidate: BetCandidate
  evaluation: ExpectedValueResult
  originalIndex: number
}

export function evaluateBetCandidate(
  candidate: BetCandidate,
  stakeYen = 100,
): ExpectedValueResult {
  return calculateExpectedValue({
    odds: candidate.odds,
    oddsObserved:
      candidate.odds !== null && candidate.odds_observed_at !== null,
    probability: candidate.hit_probability,
    stakeYen,
  })
}

export function evaluateBetCandidates(
  candidates: BetCandidate[],
  stakeYen = 100,
): BetCandidateExpectedValue[] {
  return candidates.map((candidate, originalIndex) => ({
    candidate,
    evaluation: evaluateBetCandidate(candidate, stakeYen),
    originalIndex,
  }))
}

export function rankBetCandidatesByExpectedReturn(
  candidates: BetCandidate[],
  stakeYen = 100,
): BetCandidateExpectedValue[] {
  return evaluateBetCandidates(candidates, stakeYen).sort((left, right) => {
    if (
      left.evaluation.status === 'calculated' &&
      right.evaluation.status === 'calculated'
    ) {
      return (
        right.evaluation.metrics.expectedReturnRatePercent -
          left.evaluation.metrics.expectedReturnRatePercent ||
        left.candidate.id.localeCompare(right.candidate.id)
      )
    }
    if (left.evaluation.status === 'calculated') {
      return -1
    }
    if (right.evaluation.status === 'calculated') {
      return 1
    }
    return left.candidate.id.localeCompare(right.candidate.id)
  })
}
