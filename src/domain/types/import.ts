import type { z } from 'zod'
import type { BetTypeSchema } from '../validation/common'
import type {
  BetCandidateSchema,
  HorseAssessmentSchema,
  PredictionDocumentSchema,
  ScenarioSchema,
} from '../validation/prediction'
import type {
  FinisherSchema,
  PayoutSchema,
  ResultDocumentSchema,
} from '../validation/result'

export type BetType = z.infer<typeof BetTypeSchema>
export type Scenario = z.infer<typeof ScenarioSchema>
export type HorseAssessment = z.infer<typeof HorseAssessmentSchema>
export type BetCandidate = z.infer<typeof BetCandidateSchema>
export type PredictionDocument = z.infer<typeof PredictionDocumentSchema>
export type Finisher = z.infer<typeof FinisherSchema>
export type Payout = z.infer<typeof PayoutSchema>
export type ResultDocument = z.infer<typeof ResultDocumentSchema>
export type ImportDocument = PredictionDocument | ResultDocument
