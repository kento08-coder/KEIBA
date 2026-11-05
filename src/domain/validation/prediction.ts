import { z } from 'zod'
import {
  BetTypeSchema,
  ConfidenceSchema,
  DateTimeWithOffsetSchema,
  RaceSchema,
  RunningStyleSchema,
  SCENARIO_PROBABILITY_TOLERANCE,
  ScenarioAssessmentSchema,
  buildRaceId,
  commonDocumentShape,
  findDuplicateValues,
  isFrameBet,
  validateBetSelections,
} from './common'

const nullableProbability = z.number().min(0).max(1).nullable()

export const HorseProbabilitiesSchema = z
  .object({
    win: nullableProbability,
    top2: nullableProbability,
    top3: nullableProbability,
  })
  .strict()
  .superRefine((probabilities, context) => {
    const { top2, top3, win } = probabilities

    if (win !== null && top2 !== null && win > top2) {
      context.addIssue({
        code: 'custom',
        path: ['top2'],
        message: 'top2はwin以上である必要があります。',
      })
    }
    if (top2 !== null && top3 !== null && top2 > top3) {
      context.addIssue({
        code: 'custom',
        path: ['top3'],
        message: 'top3はtop2以上である必要があります。',
      })
    }
  })

export const ScenarioSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9_-]+$/).min(1).max(50),
    label: z.string().trim().min(1).max(80),
    pace: z.enum(['slow', 'middle', 'high', 'unknown', 'other']),
    probability: z.number().min(0).max(1),
    projected_order: z
      .array(
        z
          .object({
            horse_number: z.number().int().min(1).max(99),
            position_group: z.enum([
              'front',
              'stalker',
              'midfield',
              'closer',
              'unknown',
            ]),
            note: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .max(99),
    favored_styles: z.array(RunningStyleSchema).max(5),
    reason: z.string().trim().min(1).max(1_000),
    confidence: ConfidenceSchema,
  })
  .strict()
  .superRefine((scenario, context) => {
    const duplicateHorseNumbers = findDuplicateValues(
      scenario.projected_order.map((entry) => entry.horse_number),
    )
    if (duplicateHorseNumbers.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['projected_order'],
        message: '同じ馬番を隊列内に重複して指定できません。',
      })
    }
  })

export const HorseAssessmentSchema = z
  .object({
    horse_number: z.number().int().min(1).max(99),
    frame_number: z.number().int().min(1).max(8),
    name: z.string().trim().min(1).max(100),
    running_style: RunningStyleSchema,
    past_performance: z.string().trim().min(1).max(2_000),
    form: z.enum(['excellent', 'good', 'average', 'poor', 'unknown']),
    track_suitability: z.enum([
      'strong',
      'suitable',
      'neutral',
      'unsuitable',
      'unknown',
    ]),
    distance_suitability: z.enum([
      'strong',
      'suitable',
      'neutral',
      'unsuitable',
      'unknown',
    ]),
    scenario_assessments: z.record(z.string(), ScenarioAssessmentSchema),
    probabilities: HorseProbabilitiesSchema,
    probability_source: z
      .enum(['ai_estimate', 'user_estimate', 'model_estimate', 'unset'])
      .optional(),
    rationale: z.string().trim().min(1).max(2_000),
    confidence: ConfidenceSchema,
    source_refs: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  })
  .strict()

export const BetCandidateSchema = z
  .object({
    id: z.string().trim().regex(/^[A-Za-z0-9_-]+$/).min(1).max(80),
    bet_type: BetTypeSchema,
    horse_numbers: z.array(z.number().int().min(1).max(99)).max(3),
    odds: z.number().finite().gt(1).nullable(),
    odds_observed_at: DateTimeWithOffsetSchema.nullable(),
    hit_probability: nullableProbability,
    probability_source: z.enum([
      'ai_estimate',
      'user_estimate',
      'model_estimate',
      'unset',
    ]),
    rationale: z.string().trim().min(1).max(1_000),
    confidence: ConfidenceSchema,
    source_refs: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    validateBetSelections(candidate.bet_type, candidate.horse_numbers, context)

    if ((candidate.odds === null) !== (candidate.odds_observed_at === null)) {
      context.addIssue({
        code: 'custom',
        path: ['odds_observed_at'],
        message: 'oddsとodds_observed_atは両方を設定するか、両方をnullにしてください。',
      })
    }

    if (
      candidate.hit_probability === null &&
      candidate.probability_source !== 'unset'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['probability_source'],
        message: '的中確率が未設定の場合はprobability_sourceをunsetにしてください。',
      })
    }

    if (
      candidate.hit_probability !== null &&
      candidate.probability_source === 'unset'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['probability_source'],
        message: '的中確率を設定した場合は推定元を指定してください。',
      })
    }
  })

export const PredictionDocumentSchema = z
  .object({
    ...commonDocumentShape,
    document_type: z.literal('prediction'),
    race: RaceSchema,
    scenarios: z.array(ScenarioSchema).min(1).max(20),
    horses: z.array(HorseAssessmentSchema).min(1).max(99),
    bet_candidates: z.array(BetCandidateSchema).max(1_000),
    change_reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((prediction, context) => {
    if (prediction.race_id !== buildRaceId(prediction.race)) {
      context.addIssue({
        code: 'custom',
        path: ['race_id'],
        message: 'race_idがraceの開催情報と一致しません。',
      })
    }

    const scenarioProbabilityTotal = prediction.scenarios.reduce(
      (total, scenario) => total + scenario.probability,
      0,
    )
    if (
      Math.abs(scenarioProbabilityTotal - 1) >
      SCENARIO_PROBABILITY_TOLERANCE
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scenarios'],
        message: '展開シナリオの確率合計は1である必要があります。',
      })
    }

    const duplicateScenarioIds = findDuplicateValues(
      prediction.scenarios.map((scenario) => scenario.id),
    )
    if (duplicateScenarioIds.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['scenarios'],
        message: `シナリオIDが重複しています: ${[...duplicateScenarioIds].join(', ')}`,
      })
    }

    const duplicateHorseNumbers = findDuplicateValues(
      prediction.horses.map((horse) => horse.horse_number),
    )
    if (duplicateHorseNumbers.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['horses'],
        message: `馬番が重複しています: ${[...duplicateHorseNumbers].join(', ')}`,
      })
    }

    const duplicateCandidateIds = findDuplicateValues(
      prediction.bet_candidates.map((candidate) => candidate.id),
    )
    if (duplicateCandidateIds.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['bet_candidates'],
        message: `馬券候補IDが重複しています: ${[...duplicateCandidateIds].join(', ')}`,
      })
    }

    const scenarioIds = new Set(
      prediction.scenarios.map((scenario) => scenario.id),
    )
    const duplicateSourceIds = findDuplicateValues(
      prediction.sources.flatMap((source) => (source.id ? [source.id] : [])),
    )
    if (duplicateSourceIds.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: `出典IDが重複しています: ${[...duplicateSourceIds].join(', ')}`,
      })
    }
    const sourceReferences = new Set(
      prediction.sources.flatMap((source) =>
        source.id ? [source.id, source.url] : [source.url],
      ),
    )
    const horseNumbers = new Set(
      prediction.horses.map((horse) => horse.horse_number),
    )
    const frameNumbers = new Set(
      prediction.horses.map((horse) => horse.frame_number),
    )

    prediction.horses.forEach((horse, horseIndex) => {
      for (const scenarioId of Object.keys(horse.scenario_assessments)) {
        if (!scenarioIds.has(scenarioId)) {
          context.addIssue({
            code: 'custom',
            path: ['horses', horseIndex, 'scenario_assessments', scenarioId],
            message: '存在しないシナリオIDが指定されています。',
          })
        }
      }
      horse.source_refs?.forEach((sourceRef, sourceIndex) => {
        if (!sourceReferences.has(sourceRef)) {
          context.addIssue({
            code: 'custom',
            path: ['horses', horseIndex, 'source_refs', sourceIndex],
            message: 'sourcesに存在しない出典参照です。',
          })
        }
      })
    })

    prediction.scenarios.forEach((scenario, scenarioIndex) => {
      scenario.projected_order.forEach((entry, orderIndex) => {
        if (!horseNumbers.has(entry.horse_number)) {
          context.addIssue({
            code: 'custom',
            path: [
              'scenarios',
              scenarioIndex,
              'projected_order',
              orderIndex,
              'horse_number',
            ],
            message: '隊列に存在しない馬番が指定されています。',
          })
        }
      })
    })

    prediction.bet_candidates.forEach((candidate, candidateIndex) => {
      const validNumbers = isFrameBet(candidate.bet_type)
        ? frameNumbers
        : horseNumbers
      candidate.horse_numbers.forEach((horseNumber, numberIndex) => {
        if (!validNumbers.has(horseNumber)) {
          context.addIssue({
            code: 'custom',
            path: [
              'bet_candidates',
              candidateIndex,
              'horse_numbers',
              numberIndex,
            ],
            message: isFrameBet(candidate.bet_type)
              ? '出走馬に存在しない枠番です。'
              : '出走馬に存在しない馬番です。',
          })
        }
      })
      candidate.source_refs?.forEach((sourceRef, sourceIndex) => {
        if (!sourceReferences.has(sourceRef)) {
          context.addIssue({
            code: 'custom',
            path: [
              'bet_candidates',
              candidateIndex,
              'source_refs',
              sourceIndex,
            ],
            message: 'sourcesに存在しない出典参照です。',
          })
        }
      })
    })
  })
