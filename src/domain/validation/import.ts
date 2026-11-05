import { z } from 'zod'
import type { ImportDocument, PredictionDocument } from '../types/import'
import { MAX_IMPORT_BYTES } from './common'
import { PredictionDocumentSchema } from './prediction'
import { ResultDocumentSchema } from './result'

export const ImportDocumentSchema = z.union([
  PredictionDocumentSchema,
  ResultDocumentSchema,
])

export interface ValidationIssue {
  code: string
  message: string
  path: string
}

export type ValidationWarning = ValidationIssue

export type ImportValidationResult =
  | {
      success: true
      data: ImportDocument
      warnings: ValidationWarning[]
    }
  | {
      success: false
      errors: ValidationIssue[]
    }

function formatPath(path: PropertyKey[]) {
  return path.length === 0 ? '$' : `$.${path.map(String).join('.')}`
}

function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: formatPath(issue.path),
  }))
}

function getPredictionWarnings(
  prediction: PredictionDocument,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  const scenarioIds = prediction.scenarios.map((scenario) => scenario.id)

  if (prediction.sources.length === 0) {
    warnings.push({
      code: 'sources_missing',
      message: '予想の出典が登録されていません。推定根拠を確認してください。',
      path: '$.sources',
    })
  }

  if (prediction.bet_candidates.length === 0) {
    warnings.push({
      code: 'bet_candidates_empty',
      message: '馬券候補がありません。見送り予想として保存できます。',
      path: '$.bet_candidates',
    })
  }

  prediction.horses.forEach((horse, horseIndex) => {
    if (Object.values(horse.probabilities).some((value) => value === null)) {
      warnings.push({
        code: 'horse_probability_missing',
        message: '馬の確率に未設定値があります。自動補完は行いません。',
        path: `$.horses.${horseIndex}.probabilities`,
      })
    }

    const missingScenarioIds = scenarioIds.filter(
      (scenarioId) => !(scenarioId in horse.scenario_assessments),
    )
    if (missingScenarioIds.length > 0) {
      warnings.push({
        code: 'scenario_assessment_incomplete',
        message: `未評価のシナリオがあります: ${missingScenarioIds.join(', ')}`,
        path: `$.horses.${horseIndex}.scenario_assessments`,
      })
    }
  })

  prediction.bet_candidates.forEach((candidate, candidateIndex) => {
    if (candidate.hit_probability === null || candidate.odds === null) {
      warnings.push({
        code: 'expected_value_unavailable',
        message: '確率またはオッズが未設定のため、期待値は未算出です。',
        path: `$.bet_candidates.${candidateIndex}`,
      })
    }
  })

  return warnings
}

function getWarnings(document: ImportDocument): ValidationWarning[] {
  if (document.document_type === 'prediction') {
    return getPredictionWarnings(document)
  }

  const warnings: ValidationWarning[] = []
  if (!document.observed_pace.verified) {
    warnings.push({
      code: 'observed_pace_unverified',
      message: '実際の展開は未検証です。分析集計から除外してください。',
      path: '$.observed_pace.verified',
    })
  }
  return warnings
}

export function validateImportDocument(input: unknown): ImportValidationResult {
  const result = ImportDocumentSchema.safeParse(input)
  if (!result.success) {
    return { success: false, errors: formatZodIssues(result.error) }
  }

  return {
    success: true,
    data: result.data,
    warnings: getWarnings(result.data),
  }
}

export function parseAndValidateImportJson(
  text: string,
  maxBytes = MAX_IMPORT_BYTES,
): ImportValidationResult {
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return {
      success: false,
      errors: [
        {
          code: 'file_too_large',
          message: `JSONは${maxBytes}バイト以下にしてください。`,
          path: '$',
        },
      ],
    }
  }

  try {
    return validateImportDocument(JSON.parse(text) as unknown)
  } catch {
    return {
      success: false,
      errors: [
        {
          code: 'invalid_json',
          message: 'JSONの構文が正しくありません。',
          path: '$',
        },
      ],
    }
  }
}
