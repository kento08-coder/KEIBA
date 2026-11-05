import type { BetCandidate, BetType } from '../types/import'
import type {
  GeneratedPurchasePlan,
  PlanCandidateSnapshot,
  PurchasePlanAllocation,
  PurchasePlanSettings,
  PurchasePlanSnapshot,
  PurchasePlanStrategy,
  PurchasePlanSummary,
  SelectionOverlap,
} from '../types/purchase-plan'
import {
  calculateExpectedValue,
  evaluateBetCandidate,
  type ExpectedValueMetrics,
} from './expected-value'

export const PURCHASE_UNIT_YEN = 100
export const PURCHASE_PLAN_ALGORITHM_VERSION = 'phase1-m4-v1'

export class PurchasePlanSettingsError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues.join(' '))
    this.issues = issues
  }
}

interface EvaluatedCandidate {
  candidate: BetCandidate
  key: string
  metrics: ExpectedValueMetrics
  originalIndex: number
  referenceKellyFraction: number | null
  snapshot: PlanCandidateSnapshot
}

export interface ManualAllocationInput {
  candidateId: string
  stakeYen: number
}

export interface PlanRecalculationResult {
  allocations: PurchasePlanAllocation[]
  candidateSnapshot: PlanCandidateSnapshot[]
  errors: string[]
  overlaps: SelectionOverlap[]
  summary: PurchasePlanSummary
  warnings: string[]
}

export type PurchasePlanWriteData = Omit<PurchasePlanSnapshot<unknown>, 'createdAt'>

const persistedNumberTolerance = 1e-8

const strategyNames: Record<PurchasePlanStrategy, string> = {
  expected_value: '推定期待利益重視',
  fractional_kelly: '保守的ケリー参考',
  loss_control: '損失抑制',
}

const confidenceRank: Record<BetCandidate['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function floorToPurchaseUnit(amountYen: number) {
  if (!isFiniteNumber(amountYen) || amountYen <= 0) {
    return 0
  }
  return Math.floor(amountYen / PURCHASE_UNIT_YEN) * PURCHASE_UNIT_YEN
}

export function validatePurchasePlanSettings(settings: PurchasePlanSettings) {
  const issues: string[] = []
  if (!Number.isInteger(settings.budgetYen) || settings.budgetYen < 0) {
    issues.push('予算は0円以上の整数で指定してください。')
  }
  if (
    !Number.isInteger(settings.maxSelections) ||
    settings.maxSelections < 1 ||
    settings.maxSelections > 50
  ) {
    issues.push('購入点数上限は1〜50点で指定してください。')
  }
  if (
    !Number.isInteger(settings.maxStakePerBetYen) ||
    settings.maxStakePerBetYen < PURCHASE_UNIT_YEN ||
    settings.maxStakePerBetYen % PURCHASE_UNIT_YEN !== 0
  ) {
    issues.push('1点上限は100円以上かつ100円単位で指定してください。')
  }
  if (
    !isFiniteNumber(settings.kellyFraction) ||
    settings.kellyFraction <= 0 ||
    settings.kellyFraction > 1
  ) {
    issues.push('ケリー縮小係数は0より大きく1以下で指定してください。')
  }
  if (
    !isFiniteNumber(settings.lossControlBudgetFraction) ||
    settings.lossControlBudgetFraction <= 0 ||
    settings.lossControlBudgetFraction > 1
  ) {
    issues.push('損失抑制の予算使用率は0より大きく1以下で指定してください。')
  }
  return issues
}

function canonicalCandidateKey(candidate: BetCandidate) {
  return `${candidate.bet_type}:${candidate.horse_numbers.join('-')}`
}

function toCandidateSnapshot(candidate: BetCandidate): PlanCandidateSnapshot {
  return {
    betType: candidate.bet_type,
    candidateId: candidate.id,
    confidence: candidate.confidence,
    hitProbability: candidate.hit_probability!,
    odds: candidate.odds!,
    oddsObservedAt: candidate.odds_observed_at!,
    probabilitySource: candidate.probability_source,
    rationale: candidate.rationale,
    selections: [...candidate.horse_numbers],
  }
}

function allowedBetTypes(settings: PurchasePlanSettings) {
  return settings.betTypeMode === 'auto'
    ? null
    : new Set<BetType>(settings.selectedBetTypes)
}

function evaluateCandidates(
  candidates: BetCandidate[],
  settings: PurchasePlanSettings,
): EvaluatedCandidate[] {
  const allowed = allowedBetTypes(settings)
  const seen = new Set<string>()

  return candidates.flatMap((candidate, originalIndex) => {
    if (allowed && !allowed.has(candidate.bet_type)) {
      return []
    }
    const key = canonicalCandidateKey(candidate)
    if (seen.has(key)) {
      return []
    }

    const evaluation = evaluateBetCandidate(candidate)
    if (evaluation.status !== 'calculated') {
      return []
    }
    seen.add(key)
    const referenceKellyFraction =
      candidate.odds !== null && candidate.odds > 1
        ? (candidate.hit_probability! * candidate.odds - 1) /
          (candidate.odds - 1)
        : null

    return [
      {
        candidate,
        key,
        metrics: evaluation.metrics,
        originalIndex,
        referenceKellyFraction,
        snapshot: toCandidateSnapshot(candidate),
      },
    ]
  })
}

function roundRobinAllocations(
  candidates: EvaluatedCandidate[],
  availableYen: number,
  maxStakePerBetYen: number,
) {
  const stakes = new Map(candidates.map((candidate) => [candidate.candidate.id, 0]))
  let remainingYen = floorToPurchaseUnit(availableYen)

  while (remainingYen >= PURCHASE_UNIT_YEN) {
    let changed = false
    for (const candidate of candidates) {
      if (remainingYen < PURCHASE_UNIT_YEN) {
        break
      }
      const current = stakes.get(candidate.candidate.id) ?? 0
      if (current + PURCHASE_UNIT_YEN <= maxStakePerBetYen) {
        stakes.set(candidate.candidate.id, current + PURCHASE_UNIT_YEN)
        remainingYen -= PURCHASE_UNIT_YEN
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }

  return [...stakes.entries()]
    .filter(([, stakeYen]) => stakeYen > 0)
    .map(([candidateId, stakeYen]) => ({ candidateId, stakeYen }))
}

function selectionTokens(candidate: BetCandidate) {
  const prefix = candidate.bet_type === 'bracket_quinella' ? 'frame' : 'horse'
  return candidate.horse_numbers.map((number) => `${prefix}:${number}`)
}

function buildSummary(
  allocations: PurchasePlanAllocation[],
  budgetYen: number,
): PurchasePlanSummary {
  const totalStakeYen = allocations.reduce(
    (total, allocation) => total + allocation.stakeYen,
    0,
  )
  const expectedPayoutYen = allocations.reduce(
    (total, allocation) => total + allocation.expectedPayoutYen,
    0,
  )
  const expectedNetProfitYen = allocations.reduce(
    (total, allocation) => total + allocation.expectedNetProfitYen,
    0,
  )
  return {
    expectedNetProfitYen,
    expectedPayoutYen,
    expectedReturnRatePercent:
      totalStakeYen === 0 ? null : (expectedPayoutYen / totalStakeYen) * 100,
    totalStakeYen,
    unusedBudgetYen: Math.max(0, budgetYen - totalStakeYen),
    worstCaseLossYen: totalStakeYen,
  }
}

export function findSelectionOverlaps(
  candidateSnapshots: PlanCandidateSnapshot[],
): SelectionOverlap[] {
  const overlaps: SelectionOverlap[] = []
  for (let leftIndex = 0; leftIndex < candidateSnapshots.length; leftIndex += 1) {
    const left = candidateSnapshots[leftIndex]!
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidateSnapshots.length;
      rightIndex += 1
    ) {
      const right = candidateSnapshots[rightIndex]!
      const leftIsFrame = left.betType === 'bracket_quinella'
      const rightIsFrame = right.betType === 'bracket_quinella'
      if (leftIsFrame !== rightIsFrame) {
        continue
      }
      const sharedNumbers = [...new Set(left.selections)].filter((number) =>
        right.selections.includes(number),
      )
      if (sharedNumbers.length > 0) {
        overlaps.push({
          leftCandidateId: left.candidateId,
          rightCandidateId: right.candidateId,
          sharedNumbers,
          selectionKind: leftIsFrame ? 'frame' : 'horse',
        })
      }
    }
  }
  return overlaps
}

export function recalculatePlanAllocations(input: {
  allocations: ManualAllocationInput[]
  candidates: BetCandidate[]
  settings: PurchasePlanSettings
}): PlanRecalculationResult {
  const errors = validatePurchasePlanSettings(input.settings)
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate]),
  )
  const seenIds = new Set<string>()
  const seenCandidateKeys = new Set<string>()
  const allocations: PurchasePlanAllocation[] = []
  const candidateSnapshot: PlanCandidateSnapshot[] = []
  const warnings: string[] = []

  for (const allocation of input.allocations) {
    if (seenIds.has(allocation.candidateId)) {
      errors.push(`候補${allocation.candidateId}が重複しています。`)
      continue
    }
    seenIds.add(allocation.candidateId)
    const candidate = candidateById.get(allocation.candidateId)
    if (!candidate) {
      errors.push(`候補${allocation.candidateId}が確定予想に存在しません。`)
      continue
    }
    const candidateKey = canonicalCandidateKey(candidate)
    if (seenCandidateKeys.has(candidateKey)) {
      errors.push(
        `候補${allocation.candidateId}は同じ券種・番号組の買い目と重複しています。`,
      )
      continue
    }
    seenCandidateKeys.add(candidateKey)
    if (
      !Number.isInteger(allocation.stakeYen) ||
      allocation.stakeYen < 0 ||
      allocation.stakeYen % PURCHASE_UNIT_YEN !== 0
    ) {
      errors.push(`候補${allocation.candidateId}の購入額は100円単位で指定してください。`)
      continue
    }
    if (allocation.stakeYen === 0) {
      continue
    }
    if (allocation.stakeYen > input.settings.maxStakePerBetYen) {
      errors.push(`候補${allocation.candidateId}が1点上限を超えています。`)
      continue
    }

    const evaluation = calculateExpectedValue({
      odds: candidate.odds,
      oddsObserved:
        candidate.odds !== null && candidate.odds_observed_at !== null,
      probability: candidate.hit_probability,
      stakeYen: allocation.stakeYen,
    })
    if (evaluation.status !== 'calculated') {
      errors.push(`候補${allocation.candidateId}は期待値を算出できません。`)
      continue
    }
    const referenceKellyFraction =
      candidate.odds !== null && candidate.odds > 1
        ? Math.max(
            0,
            (candidate.hit_probability! * candidate.odds - 1) /
              (candidate.odds - 1),
          )
        : null
    allocations.push({
      candidateId: candidate.id,
      expectedNetProfitYen: evaluation.metrics.expectedNetProfitYen,
      expectedPayoutYen: evaluation.metrics.expectedPayoutYen,
      expectedReturnRatePercent:
        evaluation.metrics.expectedReturnRatePercent,
      referenceKellyFraction,
      stakeYen: allocation.stakeYen,
    })
    candidateSnapshot.push(toCandidateSnapshot(candidate))
    if (evaluation.metrics.classification !== 'positive') {
      warnings.push(`候補${candidate.id}はプラス期待値ではありません。`)
    }
    if (candidate.confidence === 'low' || candidate.confidence === 'unknown') {
      warnings.push(`候補${candidate.id}は推定確率の不確実性が高い候補です。`)
    }
  }

  if (allocations.length > input.settings.maxSelections) {
    errors.push('購入点数上限を超えています。')
  }
  const summary = buildSummary(allocations, input.settings.budgetYen)
  if (summary.totalStakeYen > input.settings.budgetYen) {
    errors.push('合計購入額が予算を超えています。')
  }
  const overlaps = findSelectionOverlaps(candidateSnapshot)
  if (overlaps.length > 0) {
    warnings.push(
      '共有する馬番または枠番があります。これは重なりの参考表示であり、統計的な相関係数ではありません。',
    )
  }

  return {
    allocations,
    candidateSnapshot,
    errors,
    overlaps,
    summary,
    warnings: [...new Set(warnings)],
  }
}

function commonEligibleCandidates(evaluated: EvaluatedCandidate[]) {
  return evaluated.filter(
    (entry) =>
      entry.metrics.classification === 'positive' &&
      entry.candidate.confidence !== 'unknown',
  )
}

function allocationInputsForStrategy(
  strategy: PurchasePlanStrategy,
  evaluated: EvaluatedCandidate[],
  settings: PurchasePlanSettings,
) {
  const eligible = commonEligibleCandidates(evaluated)
  if (strategy === 'expected_value') {
    const selected = [...eligible]
      .sort(
        (left, right) =>
          right.metrics.expectedReturnRatePercent -
            left.metrics.expectedReturnRatePercent ||
          confidenceRank[right.candidate.confidence] -
            confidenceRank[left.candidate.confidence] ||
          left.originalIndex - right.originalIndex ||
          left.candidate.id.localeCompare(right.candidate.id),
      )
      .slice(0, settings.maxSelections)
    return roundRobinAllocations(
      selected,
      settings.budgetYen,
      settings.maxStakePerBetYen,
    )
  }

  if (strategy === 'fractional_kelly') {
    const selected = eligible
      .filter(
        (entry) =>
          entry.referenceKellyFraction !== null &&
          entry.referenceKellyFraction > 0,
      )
      .sort(
        (left, right) =>
          right.referenceKellyFraction! - left.referenceKellyFraction! ||
          right.metrics.expectedReturnRatePercent -
            left.metrics.expectedReturnRatePercent ||
          left.candidate.id.localeCompare(right.candidate.id),
      )
      .slice(0, settings.maxSelections)

    let remainingYen = floorToPurchaseUnit(settings.budgetYen)
    return selected.flatMap((entry) => {
      const suggestedYen = floorToPurchaseUnit(
        settings.budgetYen *
          entry.referenceKellyFraction! *
          settings.kellyFraction,
      )
      const stakeYen = Math.min(
        suggestedYen,
        settings.maxStakePerBetYen,
        remainingYen,
      )
      if (stakeYen < PURCHASE_UNIT_YEN) {
        return []
      }
      remainingYen -= stakeYen
      return [{ candidateId: entry.candidate.id, stakeYen }]
    })
  }

  const selectedTokens = new Set<string>()
  const selected: EvaluatedCandidate[] = []
  const conservativeSelectionLimit = Math.min(settings.maxSelections, 3)
  const sorted = eligible
    .filter(
      (entry) =>
        entry.candidate.confidence === 'high' ||
        entry.candidate.confidence === 'medium',
    )
    .sort((left, right) => {
      const leftScore =
        left.candidate.hit_probability! *
        (left.candidate.confidence === 'high' ? 1 : 0.8) *
        Math.min(left.metrics.expectedReturnRatePercent / 100, 1.5)
      const rightScore =
        right.candidate.hit_probability! *
        (right.candidate.confidence === 'high' ? 1 : 0.8) *
        Math.min(right.metrics.expectedReturnRatePercent / 100, 1.5)
      return (
        rightScore - leftScore ||
        left.originalIndex - right.originalIndex ||
        left.candidate.id.localeCompare(right.candidate.id)
      )
    })

  for (const entry of sorted) {
    const tokens = selectionTokens(entry.candidate)
    if (tokens.some((token) => selectedTokens.has(token))) {
      continue
    }
    selected.push(entry)
    tokens.forEach((token) => selectedTokens.add(token))
    if (selected.length >= conservativeSelectionLimit) {
      break
    }
  }

  return roundRobinAllocations(
    selected,
    floorToPurchaseUnit(
      settings.budgetYen * settings.lossControlBudgetFraction,
    ),
    settings.maxStakePerBetYen,
  )
}

function assumptionsForStrategy(
  strategy: PurchasePlanStrategy,
  settings: PurchasePlanSettings,
) {
  const common = [
    '推定的中確率と観測時点のオッズを使用し、利益を保証しない。',
    '共同確率がないため、正確な同時的中確率・全損確率・ポートフォリオ分散は算出しない。',
    '期待純利益合計は期待値の線形性による単純合計である。',
  ]
  if (strategy === 'expected_value') {
    return [
      ...common,
      'プラス期待値候補を期待回収率順に選び、100円ずつ巡回配分する。',
    ]
  }
  if (strategy === 'fractional_kelly') {
    return [
      ...common,
      `単一馬券のケリー比率に縮小係数${settings.kellyFraction}を掛けた参考配分であり、複数馬券の最適配分ではない。`,
    ]
  }
  return [
    ...common,
    `予算の最大${Math.round(settings.lossControlBudgetFraction * 100)}%を使用し、low/unknown確信度と選択番号が重なる候補を自動配分から除外する。`,
    '極端な高オッズだけが上位にならないよう期待回収倍率の寄与を上限1.5で評価する。',
  ]
}

export function generatePurchasePlan(input: {
  candidates: BetCandidate[]
  settings: PurchasePlanSettings
  strategy: PurchasePlanStrategy
}): GeneratedPurchasePlan {
  const issues = validatePurchasePlanSettings(input.settings)
  if (issues.length > 0) {
    throw new PurchasePlanSettingsError(issues)
  }
  const evaluated = evaluateCandidates(input.candidates, input.settings)
  const allocationInputs = allocationInputsForStrategy(
    input.strategy,
    evaluated,
    input.settings,
  )
  const recalculated = recalculatePlanAllocations({
    allocations: allocationInputs,
    candidates: input.candidates,
    settings: input.settings,
  })
  if (recalculated.errors.length > 0) {
    throw new PurchasePlanSettingsError(recalculated.errors)
  }

  const warnings = [...recalculated.warnings]
  if (recalculated.allocations.length === 0) {
    warnings.push(
      '自動配分条件を満たす候補がないため、このプランは見送りです。',
    )
  }
  if (evaluated.length < input.candidates.length) {
    warnings.push(
      '未算出・券種指定外・重複の候補は自動配分から除外しました。',
    )
  }
  return {
    allocations: recalculated.allocations,
    assumptions: assumptionsForStrategy(input.strategy, input.settings),
    candidateSnapshot: recalculated.candidateSnapshot,
    name: strategyNames[input.strategy],
    settings: {
      ...input.settings,
      selectedBetTypes: [...input.settings.selectedBetTypes],
    },
    skippedCandidateCount:
      input.candidates.length - recalculated.allocations.length,
    strategy: input.strategy,
    summary: recalculated.summary,
    warnings: [...new Set(warnings)],
  }
}

export function generatePurchasePlans(
  candidates: BetCandidate[],
  settings: PurchasePlanSettings,
) {
  return (
    [
      'expected_value',
      'fractional_kelly',
      'loss_control',
    ] as const satisfies readonly PurchasePlanStrategy[]
  ).map((strategy) => generatePurchasePlan({ candidates, settings, strategy }))
}

export function buildPurchasePlanWriteData(input: {
  authorUid: string
  memo: string
  name: string
  plan: GeneratedPurchasePlan
  planId: string
  sourcePredictionVersionId: string
}): PurchasePlanWriteData {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.planId)) {
    throw new Error('プランIDの形式が不正です。')
  }
  if (!input.sourcePredictionVersionId.trim()) {
    throw new Error('元の予想バージョンIDが必要です。')
  }
  if (!input.authorUid.trim()) {
    throw new Error('保存ユーザーIDが必要です。')
  }
  const name = input.name.trim()
  if (name.length < 1 || name.length > 120) {
    throw new Error('プラン名は1〜120文字で指定してください。')
  }
  const memo = input.memo.trim()
  if (memo.length > 2_000) {
    throw new Error('メモは2,000文字以内で指定してください。')
  }
  const data: PurchasePlanWriteData = {
    algorithmVersion: PURCHASE_PLAN_ALGORITHM_VERSION,
    allocations: input.plan.allocations.map((allocation) => ({ ...allocation })),
    assumptions: [...input.plan.assumptions],
    authorUid: input.authorUid,
    budgetYen: input.plan.settings.budgetYen,
    candidateSnapshot: input.plan.candidateSnapshot.map((candidate) => ({
      ...candidate,
      selections: [...candidate.selections],
    })),
    isSimulation: true,
    memo,
    name,
    planId: input.planId,
    settings: {
      ...input.plan.settings,
      selectedBetTypes: [...input.plan.settings.selectedBetTypes],
    },
    sourcePredictionVersionId: input.sourcePredictionVersionId,
    strategy: input.plan.strategy,
    summary: { ...input.plan.summary },
    warnings: [...input.plan.warnings],
  }
  const issues = validatePurchasePlanWriteData(data)
  if (issues.length > 0) {
    throw new Error(issues.join(' '))
  }
  return data
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) <= persistedNumberTolerance
}

export function validatePurchasePlanWriteData(data: PurchasePlanWriteData) {
  const issues = validatePurchasePlanSettings(data.settings)
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(data.planId)) {
    issues.push('プランIDの形式が不正です。')
  }
  if (!data.sourcePredictionVersionId.trim()) {
    issues.push('元の予想バージョンIDが必要です。')
  }
  if (!data.authorUid.trim()) {
    issues.push('保存ユーザーIDが必要です。')
  }
  if (!data.name.trim() || data.name.length > 120) {
    issues.push('プラン名は1〜120文字で指定してください。')
  }
  if (data.memo.length > 2_000) {
    issues.push('メモは2,000文字以内で指定してください。')
  }
  if (data.algorithmVersion !== PURCHASE_PLAN_ALGORITHM_VERSION) {
    issues.push('未対応の購入プラン計算バージョンです。')
  }
  if (data.isSimulation !== true) {
    issues.push('購入プランは提案スナップショットとして保存してください。')
  }
  if (data.budgetYen !== data.settings.budgetYen) {
    issues.push('プランの予算スナップショットが一致しません。')
  }
  if (data.allocations.length > data.settings.maxSelections) {
    issues.push('購入点数上限を超えています。')
  }

  const candidateById = new Map(
    data.candidateSnapshot.map((candidate) => [candidate.candidateId, candidate]),
  )
  if (candidateById.size !== data.candidateSnapshot.length) {
    issues.push('候補スナップショットに重複があります。')
  }
  const candidateKeys = new Set(
    data.candidateSnapshot.map(
      (candidate) => `${candidate.betType}:${candidate.selections.join('-')}`,
    ),
  )
  if (candidateKeys.size !== data.candidateSnapshot.length) {
    issues.push('同じ券種・番号組の買い目が重複しています。')
  }
  const allocationIds = new Set<string>()
  for (const allocation of data.allocations) {
    if (allocationIds.has(allocation.candidateId)) {
      issues.push(`候補${allocation.candidateId}の配分が重複しています。`)
      continue
    }
    allocationIds.add(allocation.candidateId)
    if (
      !Number.isInteger(allocation.stakeYen) ||
      allocation.stakeYen < PURCHASE_UNIT_YEN ||
      allocation.stakeYen % PURCHASE_UNIT_YEN !== 0
    ) {
      issues.push(`候補${allocation.candidateId}の購入額が100円単位ではありません。`)
    }
    if (allocation.stakeYen > data.settings.maxStakePerBetYen) {
      issues.push(`候補${allocation.candidateId}が1点上限を超えています。`)
    }
    const candidate = candidateById.get(allocation.candidateId)
    if (!candidate) {
      issues.push(`候補${allocation.candidateId}の計算スナップショットがありません。`)
      continue
    }
    const expected = calculateExpectedValue({
      odds: candidate.odds,
      oddsObserved: Boolean(candidate.oddsObservedAt),
      probability: candidate.hitProbability,
      stakeYen: allocation.stakeYen,
    })
    if (
      expected.status !== 'calculated' ||
      !approximatelyEqual(
        allocation.expectedNetProfitYen,
        expected.metrics.expectedNetProfitYen,
      ) ||
      !approximatelyEqual(
        allocation.expectedPayoutYen,
        expected.metrics.expectedPayoutYen,
      ) ||
      !approximatelyEqual(
        allocation.expectedReturnRatePercent,
        expected.metrics.expectedReturnRatePercent,
      )
    ) {
      issues.push(`候補${allocation.candidateId}の期待値スナップショットが不整合です。`)
    }
  }
  if (candidateById.size !== allocationIds.size) {
    issues.push('候補スナップショットと配分の件数が一致しません。')
  }

  const expectedSummary = buildSummary(data.allocations, data.budgetYen)
  if (
    data.summary.totalStakeYen !== expectedSummary.totalStakeYen ||
    data.summary.unusedBudgetYen !== expectedSummary.unusedBudgetYen ||
    data.summary.worstCaseLossYen !== expectedSummary.worstCaseLossYen ||
    !approximatelyEqual(
      data.summary.expectedNetProfitYen,
      expectedSummary.expectedNetProfitYen,
    ) ||
    !approximatelyEqual(
      data.summary.expectedPayoutYen,
      expectedSummary.expectedPayoutYen,
    ) ||
    (data.summary.expectedReturnRatePercent === null) !==
      (expectedSummary.expectedReturnRatePercent === null) ||
    (data.summary.expectedReturnRatePercent !== null &&
      expectedSummary.expectedReturnRatePercent !== null &&
      !approximatelyEqual(
        data.summary.expectedReturnRatePercent,
        expectedSummary.expectedReturnRatePercent,
      ))
  ) {
    issues.push('購入プランの集計値が配分内容と一致しません。')
  }
  if (expectedSummary.totalStakeYen > data.budgetYen) {
    issues.push('合計購入額が予算を超えています。')
  }
  return [...new Set(issues)]
}
