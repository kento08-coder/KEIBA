import fs from 'node:fs'
import path from 'node:path'
import {
  calculateRaceSettlement,
  selectEffectivePurchases,
  settlePurchaseItem,
} from '../../src/domain/calculations/settlement'
import type { BetType, ResultDocument } from '../../src/domain/types/import'
import type { PurchaseItem, PurchaseRecord } from '../../src/domain/types/settlement'

const sample = JSON.parse(
  fs.readFileSync(path.resolve('examples/result.sample.json'), 'utf8'),
) as ResultDocument

function item(
  betType: BetType,
  selections: number[],
  stakeYen = 100,
  itemId = `${betType}-item`,
): PurchaseItem {
  return {
    betType,
    itemId,
    purchaseOdds: null,
    selections,
    sourceCandidateId: null,
    stakeYen,
  }
}

function resultWithPayouts(
  rows: Array<{
    betType: BetType
    payout?: number
    payoutType?: 'payout' | 'refund'
    selections: number[]
  }>,
): ResultDocument {
  return {
    ...structuredClone(sample),
    payouts: rows.map((row) => ({
      bet_type: row.betType,
      horse_numbers: row.selections,
      official_confirmed: true,
      payout_per_100_yen: row.payout ?? 500,
      payout_type: row.payoutType ?? 'payout',
      source_refs: ['sample-official-result'],
    })),
  }
}

function purchase(
  purchaseId: string,
  items: PurchaseItem[],
  correctionSequence = 0,
): PurchaseRecord {
  return {
    authorUid: 'user-a',
    confirmedAt: '2026-11-08T10:00:00+09:00',
    correctionOf: correctionSequence ? 'purchase-original' : null,
    correctionSequence,
    createdAt: '2026-11-08T10:00:00+09:00',
    idempotencyKey: purchaseId,
    items,
    memo: '',
    placedAt: '2026-11-08T10:00:00+09:00',
    purchaseId,
    raceId: sample.race_id,
    recordedAt: '2026-11-08T10:00:00+09:00',
    revision: 1,
    rootPurchaseId: 'purchase-original',
    sourcePlanId: null,
    sourcePredictionVersionId: null,
    status: correctionSequence ? 'corrected' : 'confirmed',
    totalStakeYen: items.reduce((sum, row) => sum + row.stakeYen, 0),
    updatedAt: '2026-11-08T10:00:00+09:00',
  }
}

describe('confirmed payout settlement', () => {
  const cases: Array<[BetType, number[]]> = [
    ['win', [2]],
    ['place', [2]],
    ['bracket_quinella', [1, 1]],
    ['quinella', [2, 7]],
    ['wide', [2, 7]],
    ['exacta', [2, 7]],
    ['trio', [2, 7, 10]],
    ['trifecta', [2, 7, 10]],
  ]

  it.each(cases)('settles %s using its official payout row', (betType, selections) => {
    const settlement = settlePurchaseItem(
      item(betType, selections, 500),
      resultWithPayouts([{ betType, payout: 480, selections }]),
    )
    expect(settlement).toMatchObject({
      netProfitYen: 1_900,
      payoutYen: 2_400,
      returnedYen: 2_400,
      status: 'hit',
    })
  })

  it.each([100, 500, 1_000])('scales the per-100-yen payout for a %i yen stake', (stakeYen) => {
    const settlement = settlePurchaseItem(
      item('win', [2], stakeYen),
      resultWithPayouts([{ betType: 'win', payout: 480, selections: [2] }]),
    )
    expect(settlement.returnedYen).toBe((480 * stakeYen) / 100)
  })

  it('marks a non-matching ticket as a loss only when that bet type has an official row', () => {
    expect(
      settlePurchaseItem(
        item('win', [7]),
        resultWithPayouts([{ betType: 'win', selections: [2] }]),
      ),
    ).toMatchObject({ netProfitYen: -100, status: 'miss' })
  })

  it('keeps a missing bet-type payout table unresolved', () => {
    expect(
      settlePurchaseItem(
        item('wide', [2, 7]),
        resultWithPayouts([{ betType: 'win', selections: [2] }]),
      ),
    ).toMatchObject({ status: 'unresolved', unresolvedReason: 'payout_table_incomplete' })
  })

  it('records refunds as returned principal, not payout profit', () => {
    expect(
      settlePurchaseItem(
        item('win', [2], 500),
        resultWithPayouts([
          { betType: 'win', payout: 100, payoutType: 'refund', selections: [2] },
        ]),
      ),
    ).toMatchObject({ netProfitYen: 0, payoutYen: 0, refundYen: 500, status: 'refund' })
  })

  it('does not decide a ticket while the result is still a draft', () => {
    expect(
      settlePurchaseItem(item('win', [2]), { ...sample, result_status: 'draft' }),
    ).toMatchObject({ status: 'unresolved', unresolvedReason: 'result_unconfirmed' })
  })

  it('supports a dead heat through each published official payout row', () => {
    const result = resultWithPayouts([
      { betType: 'win', payout: 300, selections: [2] },
      { betType: 'win', payout: 250, selections: [7] },
    ])
    expect(settlePurchaseItem(item('win', [7]), result)).toMatchObject({
      returnedYen: 250,
      status: 'hit',
    })
  })

  it('settles scratched or excluded selections only from an official refund row', () => {
    const result = resultWithPayouts([
      { betType: 'win', payout: 100, payoutType: 'refund', selections: [1] },
    ])
    expect(settlePurchaseItem(item('win', [1]), result).status).toBe('refund')
  })
})

describe('corrections and race totals', () => {
  it('keeps repeated purchases of the same ticket as separate records', () => {
    const first = purchase('purchase-one', [item('win', [2], 100, 'item-one')])
    first.rootPurchaseId = 'purchase-one'
    const second = purchase('purchase-two', [item('win', [2], 500, 'item-two')])
    second.rootPurchaseId = 'purchase-two'
    expect(calculateRaceSettlement([first, second], sample).stakeYen).toBe(600)
  })

  it('uses only the latest correction and avoids double counting', () => {
    const original = purchase('purchase-original', [item('win', [2], 1_000)])
    const correction = purchase('purchase-original-c1', [item('win', [2], 500)], 1)
    expect(selectEffectivePurchases([original, correction])).toEqual([correction])
    expect(calculateRaceSettlement([original, correction], sample)).toMatchObject({
      activePurchaseCount: 1,
      stakeYen: 500,
    })
  })
})
