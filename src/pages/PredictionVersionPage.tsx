import { ArrowLeft, GitCompare, ShieldCheck, WalletCards } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import { diffPredictionDocuments } from '../domain/prediction-utils'
import { useAuth } from '../features/auth/useAuth'
import { PredictionPreview } from '../features/predictions/PredictionPreview'
import { formatTimestamp } from '../features/races/presentation'
import {
  usePredictionVersion,
  usePredictionVersions,
} from '../features/races/use-race-data'

const ExpectedValueAnalysis = lazy(
  () => import('../features/bets/ExpectedValueAnalysis'),
)

function displayValue(value: unknown) {
  if (value === undefined) {
    return '（なし）'
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized
}
export function PredictionVersionPage() {
  const { id, versionId } = useParams()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const version = usePredictionVersion(userId, id, versionId)
  const versions = usePredictionVersions(userId, id)

  if (status !== 'signed-in') {
    return <StatusNotice tone="warning">確定予想の表示にはGoogleログインが必要です。</StatusNotice>
  }
  if (version.state === 'loading' || versions.state === 'loading') {
    return <StatusNotice>確定予想を同期しています…</StatusNotice>
  }
  if (version.error || versions.error) {
    return <StatusNotice tone="error">{version.error ?? versions.error}</StatusNotice>
  }
  if (!version.value || !id) {
    return <StatusNotice tone="error">確定予想が見つかりません。</StatusNotice>
  }

  const parent = version.value.parentVersionId
    ? versions.value.find((entry) => entry.id === version.value?.parentVersionId)
    : null
  const differences = diffPredictionDocuments(
    parent?.snapshot ?? null,
    version.value.snapshot,
  )

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to={`/races/${id}`}><ArrowLeft size={16} /> レース詳細へ</Link>
      <section className="card-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Final prediction</p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">予想 v{version.value.versionNumber}</h1>
            <p className="mt-2 text-sm text-muted">{version.value.changeReason}・{formatTimestamp(version.value.confirmedAt)}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-accent/10 px-3 py-1.5 text-xs font-bold text-teal-accent"><ShieldCheck size={15} /> 確定後は変更不可</span>
        </div>
        <p className="mt-4 break-all font-mono text-xs text-muted">SHA-256: {version.value.contentHash}</p>
        <Link
          className="button-primary mt-5"
          to={`/races/${id}/plans?versionId=${version.value.id}`}
        >
          <WalletCards size={17} /> 購入プランを作成
        </Link>
      </section>

      <Suspense fallback={<StatusNotice>期待値を計算しています…</StatusNotice>}>
        <ExpectedValueAnalysis prediction={version.value.snapshot} />
      </Suspense>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="eyebrow">Difference</p><h2 className="mt-1 text-xl font-bold text-white">前バージョンとの差分</h2></div>
          <span className="inline-flex items-center gap-2 text-xs text-muted"><GitCompare size={15} /> {differences.length}項目</span>
        </div>
        {parent ? <p className="mb-3 text-sm text-muted">比較元: v{parent.versionNumber}</p> : <StatusNotice>初回バージョンのため、すべての値を新規項目として表示します。</StatusNotice>}
        <div className="mt-3 max-h-[34rem] overflow-auto rounded-2xl border border-slate-line/80">
          <table className="min-w-full divide-y divide-slate-line/70 text-left text-sm">
            <thead className="sticky top-0 bg-navy-900 text-xs text-muted"><tr><th className="px-4 py-3">項目</th><th className="px-4 py-3">変更前</th><th className="px-4 py-3">変更後</th></tr></thead>
            <tbody className="divide-y divide-slate-line/60 bg-slate-card/80">
              {differences.map((difference) => (
                <tr key={difference.path}>
                  <td className="max-w-64 break-all px-4 py-3 font-mono text-xs text-teal-accent">{difference.path || '$'}</td>
                  <td className="max-w-sm break-words px-4 py-3 text-muted">{displayValue(difference.before)}</td>
                  <td className="max-w-sm break-words px-4 py-3 text-copy">{displayValue(difference.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3"><p className="eyebrow">Snapshot</p><h2 className="mt-1 text-xl font-bold text-white">確定内容</h2></div>
        <PredictionPreview document={version.value.snapshot} />
      </section>
    </div>
  )
}
