import { z } from 'zod'
import {
  BetTypeSchema,
  ConfidenceSchema,
  commonDocumentShape,
  findDuplicateValues,
  isFrameBet,
  validateBetSelections,
} from './common'

export const FinisherSchema = z
  .object({
    horse_number: z.number().int().min(1).max(99),
    frame_number: z.number().int().min(1).max(8),
    rank: z.number().int().positive().max(99).nullable(),
    status: z.enum([
      'finished',
      'scratched',
      'excluded',
      'disqualified',
      'did_not_finish',
    ]),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((finisher, context) => {
    if (finisher.status === 'finished' && finisher.rank === null) {
      context.addIssue({
        code: 'custom',
        path: ['rank'],
        message: '完走馬には着順が必要です。',
      })
    }
    if (finisher.status !== 'finished' && finisher.rank !== null) {
      context.addIssue({
        code: 'custom',
        path: ['rank'],
        message: '完走以外の馬には着順を設定できません。',
      })
    }
  })

export const PayoutSchema = z
  .object({
    bet_type: BetTypeSchema,
    horse_numbers: z.array(z.number().int().min(1).max(99)).max(3),
    payout_type: z.enum(['payout', 'refund']),
    payout_per_100_yen: z.number().int().nonnegative(),
    official_confirmed: z.boolean(),
    source_refs: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  })
  .strict()
  .superRefine((payout, context) => {
    validateBetSelections(payout.bet_type, payout.horse_numbers, context)
  })

export const ResultDocumentSchema = z
  .object({
    ...commonDocumentShape,
    document_type: z.literal('result'),
    result_status: z.enum(['draft', 'confirmed', 'corrected']),
    finishers: z.array(FinisherSchema).min(1).max(99),
    payouts: z.array(PayoutSchema).max(1_000),
    observed_pace: z
      .object({
        label: z.enum(['slow', 'middle', 'high', 'unknown', 'other']),
        basis: z.string().trim().min(1).max(1_000),
        verified: z.boolean(),
        passing_orders: z
          .array(
            z
              .object({
                checkpoint: z.string().trim().min(1).max(80),
                horse_numbers: z
                  .array(z.number().int().min(1).max(99))
                  .min(1)
                  .max(99),
              })
              .strict()
              .superRefine((order, context) => {
                if (findDuplicateValues(order.horse_numbers).size > 0) {
                  context.addIssue({
                    code: 'custom',
                    path: ['horse_numbers'],
                    message: '通過順に同じ馬番を重複して指定できません。',
                  })
                }
              }),
          )
          .max(30),
      })
      .strict(),
    interpretation: z
      .object({
        race_shape: z.string().trim().min(1).max(2_000),
        confidence: ConfidenceSchema,
      })
      .strict(),
    correction_of: z.string().trim().min(1).max(120).optional(),
    change_reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((result, context) => {
    const duplicateSourceIds = findDuplicateValues(
      result.sources.flatMap((source) => (source.id ? [source.id] : [])),
    )
    if (duplicateSourceIds.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: `出典IDが重複しています: ${[...duplicateSourceIds].join(', ')}`,
      })
    }
    const sourceReferences = new Set(
      result.sources.flatMap((source) =>
        source.id ? [source.id, source.url] : [source.url],
      ),
    )
    const duplicateHorseNumbers = findDuplicateValues(
      result.finishers.map((finisher) => finisher.horse_number),
    )
    if (duplicateHorseNumbers.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['finishers'],
        message: `結果の馬番が重複しています: ${[...duplicateHorseNumbers].join(', ')}`,
      })
    }

    const finisherNumbers = new Set(
      result.finishers.map((finisher) => finisher.horse_number),
    )
    const frameRunnerCounts = result.finishers.reduce<Map<number, number>>(
      (counts, finisher) => {
        if (finisher.status !== 'scratched' && finisher.status !== 'excluded') {
          counts.set(
            finisher.frame_number,
            (counts.get(finisher.frame_number) ?? 0) + 1,
          )
        }
        return counts
      },
      new Map(),
    )
    result.observed_pace.passing_orders.forEach((order, orderIndex) => {
      order.horse_numbers.forEach((horseNumber, horseIndex) => {
        if (!finisherNumbers.has(horseNumber)) {
          context.addIssue({
            code: 'custom',
            path: [
              'observed_pace',
              'passing_orders',
              orderIndex,
              'horse_numbers',
              horseIndex,
            ],
            message: '結果に存在しない馬番が指定されています。',
          })
        }
      })
    })

    const payoutKeys = result.payouts.map((payout) =>
      [
        payout.payout_type,
        payout.bet_type,
        payout.horse_numbers.join('-'),
      ].join(':'),
    )
    if (findDuplicateValues(payoutKeys).size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['payouts'],
        message: '同じ払戻または返還が重複しています。',
      })
    }

    result.payouts.forEach((payout, payoutIndex) => {
      if (isFrameBet(payout.bet_type)) {
        payout.horse_numbers.forEach((frameNumber, frameIndex) => {
          if (!frameRunnerCounts.has(frameNumber)) {
            context.addIssue({
              code: 'custom',
              path: ['payouts', payoutIndex, 'horse_numbers', frameIndex],
              message: '実際の出走馬に存在しない枠番です。',
            })
          }
        })
        if (
          payout.horse_numbers.length === 2 &&
          payout.horse_numbers[0] === payout.horse_numbers[1] &&
          (frameRunnerCounts.get(payout.horse_numbers[0]!) ?? 0) < 2
        ) {
          context.addIssue({
            code: 'custom',
            path: ['payouts', payoutIndex, 'horse_numbers'],
            message: '枠連のゾロ目は同じ枠に実際の出走馬が2頭以上いる場合だけ指定できます。',
          })
        }
        return
      }

      payout.horse_numbers.forEach((horseNumber, horseIndex) => {
        if (!finisherNumbers.has(horseNumber)) {
          context.addIssue({
            code: 'custom',
            path: ['payouts', payoutIndex, 'horse_numbers', horseIndex],
            message: '結果に存在しない馬番です。',
          })
        }
      })
    })

    result.payouts.forEach((payout, payoutIndex) => {
      payout.source_refs?.forEach((sourceRef, sourceIndex) => {
        if (!sourceReferences.has(sourceRef)) {
          context.addIssue({
            code: 'custom',
            path: ['payouts', payoutIndex, 'source_refs', sourceIndex],
            message: 'sourcesに存在しない出典参照です。',
          })
        }
      })
    })

    if (result.result_status === 'corrected' && !result.correction_of) {
      context.addIssue({
        code: 'custom',
        path: ['correction_of'],
        message: '訂正結果にはcorrection_ofが必要です。',
      })
    }

    if (
      result.result_status === 'confirmed' ||
      result.result_status === 'corrected'
    ) {
      if (result.sources.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['sources'],
          message: '確定・訂正結果には確認元のsourceが1件以上必要です。',
        })
      }
      result.payouts.forEach((payout, payoutIndex) => {
        if (!payout.official_confirmed) {
          context.addIssue({
            code: 'custom',
            path: ['payouts', payoutIndex, 'official_confirmed'],
            message: '確定・訂正結果の払戻は公式確認済みである必要があります。',
          })
        }
      })
    }
  })
