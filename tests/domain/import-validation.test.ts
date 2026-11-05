import fs from 'node:fs'
import path from 'node:path'
import {
  parseAndValidateImportJson,
  validateImportDocument,
} from '../../src/domain/validation/import'

interface PredictionFixture {
  bet_candidates: Array<{
    bet_type: string
    hit_probability: number | null
    horse_numbers: number[]
    odds: number | null
    odds_observed_at: string | null
    probability_source: string
    source_refs?: string[]
  }>
  horses: Array<{
    frame_number: number
    horse_number: number
    probabilities: {
      top2: number | null
      top3: number | null
      win: number | null
    }
    scenario_assessments: Record<string, string>
  }>
  scenarios: Array<{ probability: number }>
}

interface ResultFixture {
  correction_of?: string
  finishers: Array<{
    frame_number: number
    horse_number: number
    rank: number | null
    status: string
  }>
  observed_pace: { verified: boolean }
  payouts: Array<{
    bet_type: string
    horse_numbers: number[]
    official_confirmed: boolean
    payout_per_100_yen: number
    payout_type: string
    source_refs?: string[]
  }>
  result_status: string
}

function loadFixture<T>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(path.resolve('examples', fileName), 'utf8'),
  ) as T
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe('prediction import validation', () => {
  const predictionSample = loadFixture<PredictionFixture>(
    'prediction.sample.json',
  )

  it('accepts the complete fictional sample and reports unavailable expected values', () => {
    const result = validateImportDocument(predictionSample)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.document_type).toBe('prediction')
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'expected_value_unavailable' }),
        ]),
      )
    }
  })

  it('accepts the detailed template without inventing missing values', () => {
    const template = loadFixture('prediction.template.json')
    const result = validateImportDocument(template)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'sources_missing' }),
          expect.objectContaining({ code: 'horse_probability_missing' }),
          expect.objectContaining({ code: 'expected_value_unavailable' }),
        ]),
      )
    }
  })

  it('rejects a scenario probability total other than one', () => {
    const input = clone(predictionSample)
    input.scenarios[0]!.probability = 0.15

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects an unknown bet type', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.bet_type = 'unknown-bet'

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects duplicate horse numbers', () => {
    const input = clone(predictionSample)
    input.horses[1]!.horse_number = input.horses[0]!.horse_number

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects a hit probability above one', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.hit_probability = 1.2

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('accepts a null hit probability and keeps it unavailable', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.hit_probability = null
    input.bet_candidates[0]!.probability_source = 'unset'
    const result = validateImportDocument(input)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'expected_value_unavailable' }),
        ]),
      )
    }
  })

  it('rejects descending selections for an unordered bet type', () => {
    const input = clone(predictionSample)
    const quinella = input.bet_candidates.find(
      (candidate) => candidate.bet_type === 'quinella',
    )
    expect(quinella).toBeDefined()
    quinella!.horse_numbers = [7, 2]

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('accepts a bracket quinella same-frame selection when two horses share the frame', () => {
    const input = clone(predictionSample)
    input.horses[1]!.frame_number = input.horses[0]!.frame_number
    const bracketQuinella = input.bet_candidates.find(
      (candidate) => candidate.bet_type === 'bracket_quinella',
    )
    expect(bracketQuinella).toBeDefined()
    bracketQuinella!.horse_numbers = [1, 1]

    expect(validateImportDocument(input).success).toBe(true)
  })

  it('rejects a bracket quinella same-frame selection when only one horse uses the frame', () => {
    const input = clone(predictionSample)
    const bracketQuinella = input.bet_candidates.find(
      (candidate) => candidate.bet_type === 'bracket_quinella',
    )
    expect(bracketQuinella).toBeDefined()
    bracketQuinella!.horse_numbers = [1, 1]

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects bracket quinella frame numbers outside 1 through 8', () => {
    const input = clone(predictionSample)
    const bracketQuinella = input.bet_candidates.find(
      (candidate) => candidate.bet_type === 'bracket_quinella',
    )
    expect(bracketQuinella).toBeDefined()
    bracketQuinella!.horse_numbers = [1, 9]

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('continues to reject duplicate horse numbers for quinella', () => {
    const input = clone(predictionSample)
    const quinella = input.bet_candidates.find(
      (candidate) => candidate.bet_type === 'quinella',
    )
    expect(quinella).toBeDefined()
    quinella!.horse_numbers = [2, 2]

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('accepts official minimum odds of 1.0', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.odds = 1

    expect(validateImportDocument(input).success).toBe(true)
  })

  it('rejects odds below 1.0', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.odds = 0.9

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects a bet selection that is not in the race', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.horse_numbers = [99]

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects a source reference that does not exist', () => {
    const input = clone(predictionSample)
    input.bet_candidates[0]!.source_refs = ['missing-source']

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects inconsistent win, top2 and top3 probabilities', () => {
    const input = clone(predictionSample)
    input.horses[0]!.probabilities = { win: 0.5, top2: 0.4, top3: 0.3 }

    expect(validateImportDocument(input).success).toBe(false)
  })
})

describe('result import validation', () => {
  const resultSample = loadFixture<ResultFixture>('result.sample.json')

  it('accepts the fictional confirmed result sample', () => {
    const result = validateImportDocument(resultSample)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.document_type).toBe('result')
      expect(result.warnings).toHaveLength(0)
    }
  })

  it('rejects duplicate finisher horse numbers', () => {
    const input = clone(resultSample)
    input.finishers[1]!.horse_number = input.finishers[0]!.horse_number

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects a rank on a scratched horse', () => {
    const input = clone(resultSample)
    input.finishers[0]!.status = 'scratched'

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects duplicate payout entries', () => {
    const input = clone(resultSample)
    input.payouts.push(clone(input.payouts[0]!))

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects unconfirmed payouts in a confirmed result', () => {
    const input = clone(resultSample)
    input.payouts[0]!.official_confirmed = false

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('rejects a payout source reference that does not exist', () => {
    const input = clone(resultSample)
    input.payouts[0]!.source_refs = ['missing-source']

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('accepts a bracket quinella same-frame payout when two runners share the frame', () => {
    const input = clone(resultSample)
    input.payouts.push({
      bet_type: 'bracket_quinella',
      horse_numbers: [1, 1],
      official_confirmed: true,
      payout_per_100_yen: 720,
      payout_type: 'payout',
      source_refs: ['sample-official-result'],
    })

    expect(validateImportDocument(input).success).toBe(true)
  })

  it('rejects a bracket quinella same-frame payout when only one runner uses the frame', () => {
    const input = clone(resultSample)
    input.finishers[1]!.frame_number = 4
    input.payouts.push({
      bet_type: 'bracket_quinella',
      horse_numbers: [1, 1],
      official_confirmed: true,
      payout_per_100_yen: 720,
      payout_type: 'payout',
      source_refs: ['sample-official-result'],
    })

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('validates source references for bracket quinella payouts', () => {
    const input = clone(resultSample)
    input.payouts.push({
      bet_type: 'bracket_quinella',
      horse_numbers: [1, 1],
      official_confirmed: true,
      payout_per_100_yen: 720,
      payout_type: 'payout',
      source_refs: ['missing-source'],
    })

    const result = validateImportDocument(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'sourcesに存在しない出典参照です。',
          path: '$.payouts.5.source_refs.0',
        }),
      )
    }
  })

  it('requires correction_of for a corrected result', () => {
    const input = clone(resultSample)
    input.result_status = 'corrected'
    delete input.correction_of

    expect(validateImportDocument(input).success).toBe(false)
  })

  it('warns when observed pace is not verified', () => {
    const input = clone(resultSample)
    input.observed_pace.verified = false
    const result = validateImportDocument(input)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'observed_pace_unverified' }),
      )
    }
  })
})

describe('JSON parsing boundary', () => {
  it('rejects malformed JSON', () => {
    const result = parseAndValidateImportJson('{not-json')

    expect(result).toEqual({
      success: false,
      errors: [
        {
          code: 'invalid_json',
          message: 'JSONの構文が正しくありません。',
          path: '$',
        },
      ],
    })
  })

  it('rejects input larger than the configured byte limit', () => {
    const result = parseAndValidateImportJson('{"value":"large"}', 4)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0]?.code).toBe('file_too_large')
    }
  })
})
