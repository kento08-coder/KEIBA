import { z } from 'zod'

export const SCHEMA_VERSION = '1.0.0' as const
export const SCENARIO_PROBABILITY_TOLERANCE = 1e-6
export const MAX_IMPORT_BYTES = 1024 * 1024

export const betTypes = [
  'win',
  'place',
  'bracket_quinella',
  'quinella',
  'wide',
  'exacta',
  'trio',
  'trifecta',
] as const

export const BetTypeSchema = z.enum(betTypes)
export const ConfidenceSchema = z.enum(['high', 'medium', 'low', 'unknown'])
export const RunningStyleSchema = z.enum([
  'front',
  'stalker',
  'midfield',
  'closer',
  'unknown',
])
export const ScenarioAssessmentSchema = z.enum([
  'advantage',
  'neutral',
  'disadvantage',
  'unknown',
])

export const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください。')

export const DateTimeWithOffsetSchema = z
  .string()
  .datetime({ offset: true, message: 'タイムゾーン付きISO 8601形式で指定してください。' })

export const RaceIdSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}-[A-Z0-9_]+-\d{2}-[A-Z0-9_]+$/,
  'race_idはYYYY-MM-DD-VENUE-00-ORGANIZER形式で指定してください。',
)

export const SourceSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    url: z.url(),
    title: z.string().trim().min(1).max(200),
    checked_at: DateTimeWithOffsetSchema,
    note: z.string().trim().max(500).optional(),
  })
  .strict()

export const RaceSchema = z
  .object({
    date: CalendarDateSchema,
    organizer: z.string().trim().regex(/^[A-Z0-9_]+$/).max(20),
    venue_code: z.string().trim().regex(/^[A-Z0-9_]+$/).max(30),
    race_number: z.number().int().min(1).max(99),
    name: z.string().trim().min(1).max(120),
    surface: z.enum(['turf', 'dirt', 'obstacle', 'other', 'unknown']),
    distance_m: z.number().int().positive().max(20_000),
    track_condition: z.enum([
      'firm',
      'good',
      'yielding',
      'soft',
      'heavy',
      'unknown',
      'other',
    ]),
    weather: z.enum(['sunny', 'cloudy', 'rainy', 'snowy', 'unknown', 'other']),
    start_at: DateTimeWithOffsetSchema.optional(),
  })
  .strict()

export const commonDocumentShape = {
  schema_version: z.literal(SCHEMA_VERSION),
  race_id: RaceIdSchema,
  generated_at: DateTimeWithOffsetSchema,
  source_agent: z.string().trim().min(1).max(80),
  sources: z.array(SourceSchema).max(100),
  notes: z.string().trim().max(2_000).optional(),
}

const selectionCounts: Record<(typeof betTypes)[number], number> = {
  win: 1,
  place: 1,
  bracket_quinella: 2,
  quinella: 2,
  wide: 2,
  exacta: 2,
  trio: 3,
  trifecta: 3,
}

const unorderedBetTypes = new Set<(typeof betTypes)[number]>([
  'bracket_quinella',
  'quinella',
  'wide',
  'trio',
])

export function expectedSelectionCount(betType: (typeof betTypes)[number]) {
  return selectionCounts[betType]
}

export function isFrameBet(betType: (typeof betTypes)[number]) {
  return betType === 'bracket_quinella'
}

export function validateBetSelections(
  betType: (typeof betTypes)[number],
  selections: number[],
  context: z.RefinementCtx,
) {
  const expectedCount = expectedSelectionCount(betType)

  if (selections.length !== expectedCount) {
    context.addIssue({
      code: 'custom',
      path: ['horse_numbers'],
      message: `${betType}は${expectedCount}個の番号を指定してください。`,
    })
  }

  if (
    !isFrameBet(betType) &&
    new Set(selections).size !== selections.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['horse_numbers'],
      message: '同じ番号を重複して指定できません。',
    })
  }

  if (
    isFrameBet(betType) &&
    selections.some((selection) => selection < 1 || selection > 8)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['horse_numbers'],
      message: '枠連のhorse_numbersには1〜8の枠番を指定してください。',
    })
  }

  const hasInvalidUnorderedSequence = selections.some(
    (selection, index) =>
      index > 0 &&
      (isFrameBet(betType)
        ? selection < selections[index - 1]!
        : selection <= selections[index - 1]!),
  )

  if (unorderedBetTypes.has(betType) && hasInvalidUnorderedSequence) {
    context.addIssue({
      code: 'custom',
      path: ['horse_numbers'],
      message: isFrameBet(betType)
        ? '枠連の枠番は昇順で指定してください。ゾロ目だけ同じ枠番を指定できます。'
        : '順不同券種の番号は重複なしの昇順で指定してください。',
    })
  }
}

export function buildRaceId(race: z.infer<typeof RaceSchema>) {
  return [
    race.date,
    race.venue_code,
    race.race_number.toString().padStart(2, '0'),
    race.organizer,
  ].join('-')
}

export function findDuplicateValues<T>(values: T[]) {
  const seen = new Set<T>()
  const duplicates = new Set<T>()

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }
    seen.add(value)
  }

  return duplicates
}
