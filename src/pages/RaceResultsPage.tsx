import { useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, FileJson, RotateCcw, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import { calculateExpectedValue } from '../domain/calculations/expected-value'
import { createResultInputTemplate } from '../domain/result-template'
import {
  calculateRaceSettlement,
  selectEffectivePurchases,
  selectEffectiveResult,
  settlePurchase,
} from '../domain/calculations/settlement'
import { ResultDocumentSchema } from '../domain/validation/result'
import { useAuth } from '../features/auth/useAuth'
import { usePurchasePlans, useRace } from '../features/races/use-race-data'
import { usePurchases, useResults } from '../features/settlements/use-settlement-data'
import { saveResult } from '../infrastructure/repositories/settlement-repository'

function yen(value: number | null) {
  return value === null ? '未判定' : `${Math.round(value).toLocaleString()}円`
}

export function RaceResultsPage() {
  const { id } = useParams()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const race = useRace(userId, id)
  const purchases = usePurchases(userId, id)
  const results = useResults(userId, id)
  const plans = usePurchasePlans(userId, id)
  const [jsonText, setJsonText] = useState(() => JSON.stringify(createResultInputTemplate(id ?? 'race-id'), null, 2))
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [correctionOf, setCorrectionOf] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const parsed = useMemo(() => {
    try {
      return ResultDocumentSchema.safeParse(JSON.parse(jsonText))
    } catch {
      return { success: false as const, error: { issues: [{ message: 'JSONの構文が正しくありません。' }] } }
    }
  }, [jsonText])
  const activePurchases = useMemo(() => selectEffectivePurchases(purchases.value), [purchases.value])
  const activeResult = useMemo(() => selectEffectiveResult(results.value), [results.value])
  const summary = useMemo(() => calculateRaceSettlement(purchases.value, activeResult?.payload ?? null), [activeResult, purchases.value])

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setJsonText(await file.text())
    setSourceFileName(file.name)
  }

  function beginCorrection() {
    if (!activeResult) return
    setCorrectionOf(activeResult.resultId)
    setJsonText(JSON.stringify({ ...activeResult.payload, result_status: 'corrected', correction_of: activeResult.resultId, change_reason: '結果の訂正' }, null, 2))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirm() {
    setError(null)
    setNotice(null)
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '))
      return
    }
    if (parsed.data.race_id !== id) {
      setError('JSONのrace_idが表示中のレースと一致しません。')
      return
    }
    setSaving(true)
    try {
      await saveResult({
        expectedPurchaseRevision: race.value?.purchaseRevision ?? 0,
        ...(correctionOf ? { originalResultId: correctionOf } : {}),
        payload: parsed.data,
        sourceFileName,
        userId: userId!,
      })
      setNotice(correctionOf ? '結果の訂正記録を確定しました。' : 'レース結果を確定しました。')
      setCorrectionOf(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'レース結果を保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'signed-in') return <StatusNotice tone="warning">結果登録にはGoogleログインが必要です。</StatusNotice>
  if (!id || !userId) return <StatusNotice tone="error">レースを特定できません。</StatusNotice>
  if (!race.value) return <StatusNotice>レースと結果を同期しています…</StatusNotice>

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to={`/races/${id}`}><ArrowLeft size={16} /> レース詳細へ戻る</Link>
      <header>
        <p className="eyebrow">Official settlement</p>
        <h1 className="page-title mt-2">{race.value.name}｜結果・払戻</h1>
        <p className="muted-copy mt-3">着順から倍率を推定せず、JRA/NARの確定払戻表を100円当たりで記録してください。</p>
        <p className="mt-2 text-xs text-muted">
          購入集合 revision {race.value.purchaseRevision ?? 0} を確認して確定します。別端末で購入が変わった場合は部分保存せず、再読み込みを求めます。
        </p>
      </header>
      <section className="card-surface space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Result JSON</p><h2 className="mt-1 text-xl font-bold text-white">{correctionOf ? '結果を訂正' : '結果を登録'}</h2></div>
          <label className="button-secondary cursor-pointer"><FileJson size={16} /> JSONファイル<input accept="application/json,.json" className="sr-only" onChange={(event) => void loadFile(event)} type="file" /></label>
        </div>
        <p className="text-xs text-muted">着順、同着（同じrank）、取消・除外・競走中止、払戻・返還、情報源を編集できます。不明値は補完しないでください。</p>
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
        <textarea aria-label="結果JSON" className="field-input min-h-[28rem] font-mono text-xs" spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
        {!parsed.success ? <StatusNotice tone="error">{parsed.error.issues.map((issue) => issue.message).join(' ')}</StatusNotice> : <StatusNotice tone="warning">JSON形式の検証に成功しました。アプリは情報源を自動確認しません。公式サイトで着順・払戻・返還を確認し、確認済みの内容だけを確定してください。</StatusNotice>}
        <div className="flex justify-end"><button className="button-primary" disabled={saving || !parsed.success} onClick={() => void confirm()} type="button"><ShieldCheck size={16} /> {correctionOf ? '訂正結果を確定' : '結果を確定'}</button></div>
      </section>

      <section className="card-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Realized outcome</p><h2 className="mt-1 text-xl font-bold text-white">予想・提案・実績の比較</h2></div>{activeResult ? <button className="button-secondary" onClick={beginCorrection} type="button"><RotateCcw size={16} /> 結果を訂正</button> : null}</div>
        {!activeResult ? <div className="mt-4"><StatusNotice>結果は未確定です。購入を不的中とは判定しません。</StatusNotice></div> : null}
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-muted">有効購入額</dt><dd className="mt-1 font-bold text-white">{summary.stakeYen.toLocaleString()}円</dd></div>
          <div><dt className="text-xs text-muted">払戻金</dt><dd className="mt-1 font-bold text-white">{summary.payoutYen.toLocaleString()}円</dd></div>
          <div><dt className="text-xs text-muted">返還額</dt><dd className="mt-1 font-bold text-white">{summary.refundYen.toLocaleString()}円</dd></div>
          <div><dt className="text-xs text-muted">実現損益</dt><dd className="mt-1 font-bold text-white">{yen(summary.netProfitYen)}</dd></div>
        </dl>
        {summary.unresolvedItemCount > 0 ? <div className="mt-4"><StatusNotice tone="warning">払戻表が不足している{summary.unresolvedItemCount}件は未判定です。未判定を不的中として集計していません。</StatusNotice></div> : null}
        <div className="mt-5 space-y-3">
          {activePurchases.map((purchase) => {
            const settlement = settlePurchase(purchase, activeResult?.payload ?? null)
            const plan = plans.value.find((entry) => entry.planId === purchase.sourcePlanId)
            return <article className="rounded-2xl border border-white/10 bg-navy-950/55 p-4" key={purchase.purchaseId}>
              <p className="font-bold text-white">実購入 {purchase.totalStakeYen.toLocaleString()}円 / 払戻 {settlement.totalPayoutYen.toLocaleString()}円 / 損益 {yen(settlement.totalNetProfitYen)}</p>
              <p className="mt-1 text-xs text-muted">提案額: {plan ? `${plan.summary.totalStakeYen.toLocaleString()}円` : '購入プランなし'} / 元予想: {purchase.sourcePredictionVersionId ?? 'なし'}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{purchase.items.map((item, index) => {
                const outcome = settlement.items[index]!
                const candidate = plan?.candidateSnapshot.find((entry) => entry.candidateId === item.sourceCandidateId)
                const allocation = plan?.allocations.find((entry) => entry.candidateId === item.sourceCandidateId)
                const expected = candidate
                  ? calculateExpectedValue({ odds: candidate.odds, oddsObserved: Boolean(candidate.oddsObservedAt), probability: candidate.hitProbability, stakeYen: item.stakeYen })
                  : null
                return <div className="rounded-xl bg-navy-900 p-3 text-xs" key={item.itemId}><p className="font-bold text-copy">{item.betType} {item.selections.join('-')}・実購入 {item.stakeYen}円</p><p className="mt-1 text-muted">提案 {allocation ? `${allocation.stakeYen}円` : 'なし'} / 予想確率 {candidate ? `${(candidate.hitProbability * 100).toFixed(1)}%` : '不明'} / 観測オッズ {candidate?.odds ?? '不明'}</p><p className="mt-1 text-muted">推定期待利益 {expected?.status === 'calculated' ? `${Math.round(expected.metrics.expectedNetProfitYen)}円` : '未算出'}</p><p className="mt-1 text-teal-accent">{outcome.status}・実払戻 {outcome.returnedYen === null ? '未判定' : `${outcome.returnedYen}円`}</p></div>
              })}</div>
            </article>
          })}
        </div>
      </section>
    </div>
  )
}
