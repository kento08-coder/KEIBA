import { z } from 'zod'
import { PURCHASE_PLAN_MAX_BUDGET_YEN } from '../calculations/purchase-plan'
import { BetTypeSchema, validateBetSelections } from './common'

export const PurchaseItemSchema = z
  .object({
    betType: BetTypeSchema,
    itemId: z.string().trim().regex(/^[A-Za-z0-9_-]{8,120}$/),
    purchaseOdds: z.number().finite().min(1).nullable(),
    selections: z.array(z.number().int().min(1).max(99)).min(1).max(3),
    sourceCandidateId: z.string().trim().min(1).max(120).nullable(),
    stakeYen: z
      .number()
      .int()
      .min(100)
      .max(PURCHASE_PLAN_MAX_BUDGET_YEN)
      .refine((value) => value % 100 === 0, '購入金額は100円単位で指定してください。'),
  })
  .strict()
  .superRefine((item, context) => {
    validateBetSelections(item.betType, item.selections, context)
  })

export const PurchaseInputSchema = z
  .object({
    idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,160}$/),
    items: z.array(PurchaseItemSchema).min(1).max(100),
    memo: z.string().trim().max(2_000),
    placedAt: z.string().datetime({ offset: true }),
    purchaseId: z.string().trim().regex(/^[A-Za-z0-9_-]{8,120}$/),
    raceId: z.string().trim().min(1).max(120),
    sourcePlanId: z.string().trim().min(1).max(120).nullable(),
    sourcePredictionVersionId: z.string().trim().min(1).max(120).nullable(),
  })
  .strict()
  .superRefine((purchase, context) => {
    const itemIds = purchase.items.map((item) => item.itemId)
    if (new Set(itemIds).size !== itemIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '購入明細IDが重複しています。',
      })
    }
    const totalStakeYen = purchase.items.reduce(
      (total, item) => total + item.stakeYen,
      0,
    )
    if (totalStakeYen > PURCHASE_PLAN_MAX_BUDGET_YEN) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '購入合計は10,000,000円以下にしてください。',
      })
    }
  })

export type PurchaseInput = z.infer<typeof PurchaseInputSchema>
