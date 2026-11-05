import { useMemo, useState } from 'react'
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type { PurchasePlanRecord } from '../../domain/types/firestore'
import type { BetType } from '../../domain/types/import'
import type { PurchaseInput } from '../../domain/validation/purchase'
import { PurchaseInputSchema } from '../../domain/validation/purchase'
import {
  correctPurchase,
  purchaseInputFromPlan,
  savePurchase,
} from '../../infrastructure/repositories/settlement-repository'
import { StatusNotice } from '../../components/StatusNotice'

const betTypes: Array<[BetType, string]> = [
  ['win', '単勝'],
  ['place', '複勝'],
  ['bracket_quinella', '枠連'],
  ['quinella', '馬連'],
  ['wide', 'ワイド'],
  ['exacta', '馬単'],
  ['trio', '三連複'],
  ['trifecta', '三連単'],
]

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
}

function blankInput(raceId: string): PurchaseInput {
  const purchaseId = newId('purchase')
  return {
    idempotencyKey: `purchase-${purchaseId}`,
    items: [
      {
        betType: 'win',
        itemId: newId('item'),
        purchaseOdds: null,
        selections: [1],
        sourceCandidateId: null,
        stakeYen: 100,
      },
    ],
    memo: '',
    placedAt: new Date().toISOString(),
    purchaseId,
    raceId,
    sourcePlanId: null,
    sourcePredictionVersionId: null,
  }
}

interface Props {
  correctionOf?: string
  initial?: PurchaseInput
  initialRevision?: number
  plan?: PurchasePlanRecord<unknown>
  raceId: string
  userId: string
}

export function PurchaseRecorder({
  correctionOf,
  initial,
  initialRevision,
  plan,
  raceId,
  userId,
}: Props) {
  const [data, setData] = useState<PurchaseInput>(() => {
    if (initial) return initial
    if (plan) return purchaseInputFromPlan(plan, raceId, newId('purchase'))
    return blankInput(raceId)
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState<number | undefined>(initialRevision)

  const validation = useMemo(() => PurchaseInputSchema.safeParse(data), [data])
  const total = data.items.reduce((sum, item) => sum + item.stakeYen, 0)

  function updateItem(index: number, patch: Partial<PurchaseInput['items'][number]>) {
    setData((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  async function persist(status: 'draft' | 'confirmed') {
    setError(null)
    setNotice(null)
    if (!validation.success) {
      setError(validation.error.issues.map((issue) => issue.message).join(' '))
      return
    }
    setSaving(true)
    try {
      if (correctionOf) {
        if (status === 'draft') {
          throw new Error('訂正記録は下書き保存せず、確認後に訂正確定してください。')
        }
        await correctPurchase({
          data: {
            items: data.items,
            memo: data.memo,
            placedAt: data.placedAt,
            raceId,
          },
          originalPurchaseId: correctionOf,
          userId,
        })
      } else {
        const saved = await savePurchase({
          data,
          ...(revision === undefined ? {} : { expectedRevision: revision }),
          status,
          userId,
        })
        setRevision(saved.revision)
      }
      setNotice(status === 'draft' ? '購入下書きを保存しました。' : correctionOf ? '訂正記録を確定しました。' : '実購入記録を確定しました。')
      if (status === 'confirmed') setData(blankInput(raceId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '購入記録を保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card-surface space-y-5 p-4 sm:p-6">
      <div>
        <p className="eyebrow">Actual purchase</p>
        <h2 className="mt-1 text-xl font-bold text-white">
          {correctionOf ? '購入記録を訂正' : plan ? '購入プランから実購入を記録' : '実購入を手動登録'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          これは記録操作です。外部の投票サイトへ注文は送信しません。
        </p>
      </div>
      {plan ? (
        <StatusNotice tone="info">
          提案「{plan.name}」を初期値にしました。実際の購入額・オッズへ自由に修正できます。
        </StatusNotice>
      ) : null}
      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
      {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
      <div className="space-y-3">
        {data.items.map((item, index) => (
          <div className="rounded-2xl border border-white/10 bg-navy-950/55 p-3" key={item.itemId}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="field-label">券種
                <select className="field-input" value={item.betType} onChange={(event) => updateItem(index, { betType: event.target.value as BetType })}>
                  {betTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field-label">馬番・枠番
                <input className="field-input" value={item.selections.join('-')} onChange={(event) => updateItem(index, { selections: event.target.value.split(/[-,\s]+/).filter(Boolean).map(Number) })} />
              </label>
              <label className="field-label">実購入額（円）
                <input className="field-input" min="100" step="100" type="number" value={item.stakeYen} onChange={(event) => updateItem(index, { stakeYen: Number(event.target.value) })} />
              </label>
              <label className="field-label">購入時オッズ（任意）
                <input className="field-input" min="1" step="0.1" type="number" value={item.purchaseOdds ?? ''} onChange={(event) => updateItem(index, { purchaseOdds: event.target.value ? Number(event.target.value) : null })} />
              </label>
              <button aria-label="明細を削除" className="button-secondary self-end" disabled={data.items.length === 1} onClick={() => setData((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} type="button">
                <Trash2 size={16} /> 削除
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="button-secondary" onClick={() => setData((current) => ({ ...current, items: [...current.items, { betType: 'win', itemId: newId('item'), purchaseOdds: null, selections: [1], sourceCandidateId: null, stakeYen: 100 }] }))} type="button">
        <Plus size={16} /> 買い目を追加
      </button>
      <label className="field-label">メモ
        <textarea className="field-input min-h-24" maxLength={2000} value={data.memo} onChange={(event) => setData((current) => ({ ...current, memo: event.target.value }))} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="font-bold text-white">実購入合計 {total.toLocaleString()}円</p>
        <div className="flex flex-wrap gap-2">
          {!correctionOf ? <button className="button-secondary" disabled={saving} onClick={() => void persist('draft')} type="button"><Save size={16} /> 下書き保存</button> : null}
          <button className="button-primary" disabled={saving} onClick={() => void persist('confirmed')} type="button"><ShieldCheck size={16} /> {correctionOf ? '訂正を確定' : '購入を確定'}</button>
        </div>
      </div>
    </section>
  )
}
