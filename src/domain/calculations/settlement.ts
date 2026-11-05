import type { Payout, ResultDocument } from '../types/import'
import type {
  PurchaseItem,
  PurchaseRecord,
  PurchaseSettlement,
  RaceSettlementSummary,
  ResultRecordSnapshot,
  TicketSettlement,
} from '../types/settlement'

const unorderedBetTypes = new Set([
  'bracket_quinella',
  'quinella',
  'wide',
  'trio',
])

function canonicalSelections(betType: PurchaseItem['betType'], selections: number[]) {
  return unorderedBetTypes.has(betType)
    ? [...selections].sort((left, right) => left - right)
    : [...selections]
}

export function ticketKey(input: {
  betType: PurchaseItem['betType']
  selections: number[]
}) {
  return `${input.betType}:${canonicalSelections(input.betType, input.selections).join('-')}`
}

function matchingOfficialRows(item: PurchaseItem, result: ResultDocument) {
  const key = ticketKey(item)
  return result.payouts.filter(
    (payout) => payout.official_confirmed && ticketKey({
      betType: payout.bet_type,
      selections: payout.horse_numbers,
    }) === key,
  )
}

function calculatedReturn(item: PurchaseItem, payout: Payout) {
  return (payout.payout_per_100_yen * item.stakeYen) / 100
}

export function settlePurchaseItem(
  item: PurchaseItem,
  result: ResultDocument | null,
): TicketSettlement {
  const unresolved = (
    reason: TicketSettlement['unresolvedReason'],
  ): TicketSettlement => ({
    itemId: item.itemId,
    netProfitYen: null,
    payoutYen: 0,
    refundYen: 0,
    returnRatePercent: null,
    returnedYen: null,
    stakeYen: item.stakeYen,
    status: 'unresolved',
    unresolvedReason: reason,
  })

  if (!result) {
    return unresolved('result_missing')
  }
  if (result.result_status !== 'confirmed' && result.result_status !== 'corrected') {
    return unresolved('result_unconfirmed')
  }

  const matches = matchingOfficialRows(item, result)
  if (matches.length > 1) {
    return unresolved('conflicting_official_records')
  }
  const match = matches[0]
  if (match) {
    const returnedYen = calculatedReturn(item, match)
    const isRefund = match.payout_type === 'refund'
    return {
      itemId: item.itemId,
      netProfitYen: returnedYen - item.stakeYen,
      payoutYen: isRefund ? 0 : returnedYen,
      refundYen: isRefund ? returnedYen : 0,
      returnRatePercent: (returnedYen / item.stakeYen) * 100,
      returnedYen,
      stakeYen: item.stakeYen,
      status: isRefund ? 'refund' : 'hit',
      unresolvedReason: null,
    }
  }

  const hasCompleteTypePayout = result.payouts.some(
    (payout) =>
      payout.bet_type === item.betType &&
      payout.payout_type === 'payout' &&
      payout.official_confirmed,
  )
  if (!hasCompleteTypePayout) {
    return unresolved('payout_table_incomplete')
  }

  return {
    itemId: item.itemId,
    netProfitYen: -item.stakeYen,
    payoutYen: 0,
    refundYen: 0,
    returnRatePercent: 0,
    returnedYen: 0,
    stakeYen: item.stakeYen,
    status: 'miss',
    unresolvedReason: null,
  }
}

export function selectEffectivePurchases<TTimestamp>(
  purchases: Array<PurchaseRecord<TTimestamp>>,
) {
  const activeByRoot = new Map<string, PurchaseRecord<TTimestamp>>()
  for (const purchase of purchases) {
    if (purchase.status === 'draft') continue
    const current = activeByRoot.get(purchase.rootPurchaseId)
    if (
      !current ||
      purchase.correctionSequence > current.correctionSequence ||
      (purchase.correctionSequence === current.correctionSequence &&
        purchase.purchaseId.localeCompare(current.purchaseId) > 0)
    ) {
      activeByRoot.set(purchase.rootPurchaseId, purchase)
    }
  }
  return [...activeByRoot.values()].sort((left, right) =>
    left.purchaseId.localeCompare(right.purchaseId),
  )
}

export function selectEffectiveResult<TTimestamp>(
  results: Array<ResultRecordSnapshot<TTimestamp>>,
) {
  return results
    .filter((result) => result.status !== 'draft')
    .sort(
      (left, right) =>
        right.correctionSequence - left.correctionSequence ||
        right.resultId.localeCompare(left.resultId),
    )[0] ?? null
}

export function settlePurchase(
  purchase: PurchaseRecord<unknown>,
  result: ResultDocument | null,
): PurchaseSettlement {
  const items = purchase.items.map((item) => settlePurchaseItem(item, result))
  const unresolved = items.some((item) => item.status === 'unresolved')
  const totalPayoutYen = items.reduce((total, item) => total + item.payoutYen, 0)
  const totalRefundYen = items.reduce((total, item) => total + item.refundYen, 0)
  const totalReturnedYen = totalPayoutYen + totalRefundYen
  return {
    items,
    purchaseId: purchase.purchaseId,
    totalNetProfitYen: unresolved ? null : totalReturnedYen - purchase.totalStakeYen,
    totalPayoutYen,
    totalRefundYen,
    totalReturnedYen: unresolved ? null : totalReturnedYen,
    totalStakeYen: purchase.totalStakeYen,
  }
}

export function calculateRaceSettlement(
  purchases: Array<PurchaseRecord<unknown>>,
  result: ResultDocument | null,
): RaceSettlementSummary {
  const active = selectEffectivePurchases(purchases)
  const settlements = active.map((purchase) => settlePurchase(purchase, result))
  const items = settlements.flatMap((settlement) => settlement.items)
  const unresolvedItemCount = items.filter(
    (item) => item.status === 'unresolved',
  ).length
  const stakeYen = settlements.reduce(
    (total, settlement) => total + settlement.totalStakeYen,
    0,
  )
  const payoutYen = settlements.reduce(
    (total, settlement) => total + settlement.totalPayoutYen,
    0,
  )
  const refundYen = settlements.reduce(
    (total, settlement) => total + settlement.totalRefundYen,
    0,
  )
  const returnedYen = payoutYen + refundYen
  const fullyResolved = unresolvedItemCount === 0
  return {
    activePurchaseCount: active.length,
    itemCount: items.length,
    netProfitYen: fullyResolved ? returnedYen - stakeYen : null,
    payoutYen,
    refundYen,
    resolvedItemCount: items.length - unresolvedItemCount,
    returnRatePercent:
      fullyResolved && stakeYen > 0 ? (returnedYen / stakeYen) * 100 : null,
    returnedYen,
    stakeYen,
    unresolvedItemCount,
  }
}
