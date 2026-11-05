import { useMemo, useState } from 'react'
import { ArrowLeft, History, RotateCcw } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import { selectEffectivePurchases } from '../domain/calculations/settlement'
import type { PurchaseInput } from '../domain/validation/purchase'
import { useAuth } from '../features/auth/useAuth'
import { usePurchasePlans, useRace } from '../features/races/use-race-data'
import { PurchaseRecorder } from '../features/settlements/PurchaseRecorder'
import { usePurchases } from '../features/settlements/use-settlement-data'

function editableInput(record: ReturnType<typeof selectEffectivePurchases>[number]): PurchaseInput {
  return {
    idempotencyKey: record.idempotencyKey,
    items: record.items,
    memo: record.memo,
    placedAt: record.placedAt,
    purchaseId: record.purchaseId,
    raceId: record.raceId,
    sourcePlanId: record.sourcePlanId,
    sourcePredictionVersionId: record.sourcePredictionVersionId,
  }
}

export function RacePurchasesPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const race = useRace(userId, id)
  const plans = usePurchasePlans(userId, id)
  const purchases = usePurchases(userId, id)
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const selectedPlan = plans.value.find((plan) => plan.planId === searchParams.get('planId'))
  const active = useMemo(() => selectEffectivePurchases(purchases.value), [purchases.value])
  const correcting = active.find((record) => record.purchaseId === correctingId)
  const editingDraft = purchases.value.find(
    (record) => record.status === 'draft' && record.purchaseId === editingDraftId,
  )
  const editedRecord = correcting ?? editingDraft

  if (status !== 'signed-in') return <StatusNotice tone="warning">購入記録にはGoogleログインが必要です。</StatusNotice>
  if (!id || !userId) return <StatusNotice tone="error">レースを特定できません。</StatusNotice>
  if (race.state === 'loading') return <StatusNotice>購入記録を同期しています…</StatusNotice>
  if (!race.value) return <StatusNotice tone="error">対象レースが見つかりません。</StatusNotice>

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to={`/races/${id}`}><ArrowLeft size={16} /> レース詳細へ戻る</Link>
      <header>
        <p className="eyebrow">Purchase records</p>
        <h1 className="page-title mt-2">{race.value.name}｜実購入記録</h1>
        <p className="muted-copy mt-3">購入プランと実購入は分離して保存します。確定後は上書きせず、訂正履歴を追加します。</p>
      </header>
      <PurchaseRecorder
        {...(editedRecord ? {
          initial: editableInput(editedRecord),
        } : {})}
        {...(correcting ? { correctionOf: correcting.purchaseId } : {})}
        {...(editingDraft ? { initialRevision: editingDraft.revision } : {})}
        key={editedRecord?.purchaseId ?? selectedPlan?.planId ?? 'manual'}
        {...(!editedRecord && selectedPlan ? { plan: selectedPlan } : {})}
        raceId={id}
        userId={userId}
      />
      <section>
        <h2 className="flex items-center gap-2 text-xl font-bold text-white"><History className="text-teal-accent" size={20} /> 購入記録一覧</h2>
        {purchases.error ? <StatusNotice tone="error">{purchases.error}</StatusNotice> : null}
        {active.length === 0 ? <div className="mt-3"><StatusNotice>確定済みの購入記録はありません。</StatusNotice></div> : null}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {purchases.value.filter((record) => record.status === 'draft').map((record) => (
            <article className="card-surface border-amber-400/30 p-4" key={record.purchaseId}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-bold text-white">下書き・{record.totalStakeYen.toLocaleString()}円</p><p className="mt-1 text-xs text-muted">revision {record.revision}・まだ収支へ計上されません</p></div>
                <button className="button-secondary" onClick={() => { setCorrectingId(null); setEditingDraftId(record.purchaseId) }} type="button">下書きを編集</button>
              </div>
            </article>
          ))}
          {active.map((record) => (
            <article className="card-surface p-4" key={record.purchaseId}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-bold text-white">{record.totalStakeYen.toLocaleString()}円</p><p className="mt-1 text-xs text-muted">{record.items.length}点・{record.status}・訂正{record.correctionSequence}回</p></div>
                <button className="button-secondary" onClick={() => { setEditingDraftId(null); setCorrectingId(record.purchaseId) }} type="button"><RotateCcw size={15} /> 訂正</button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-copy">
                {record.items.map((item) => <li key={item.itemId}>{item.betType} {item.selections.join('-')}：{item.stakeYen.toLocaleString()}円{item.purchaseOdds ? `（購入時 ${item.purchaseOdds}倍）` : ''}</li>)}
              </ul>
              <p className="mt-3 text-xs text-muted">元プラン: {record.sourcePlanId ?? 'なし（手動）'} / 元予想: {record.sourcePredictionVersionId ?? 'なし'}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
