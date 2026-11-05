import { ArrowLeft, History } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import type { PurchasePlanWriteData } from '../domain/calculations/purchase-plan'
import { useAuth } from '../features/auth/useAuth'
import { PurchasePlanBuilder } from '../features/bets/PurchasePlanBuilder'
import { formatTimestamp } from '../features/races/presentation'
import {
  usePredictionVersion,
  usePurchasePlans,
  useRace,
} from '../features/races/use-race-data'
import { savePurchasePlan } from '../infrastructure/repositories/race-repository'

export function PurchasePlansPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const versionId = searchParams.get('versionId') ?? undefined
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const race = useRace(userId, id)
  const version = usePredictionVersion(userId, id, versionId)
  const savedPlans = usePurchasePlans(userId, id)

  if (status !== 'signed-in') {
    return (
      <StatusNotice tone="warning">
        購入プランの作成・保存にはGoogleログインが必要です。
      </StatusNotice>
    )
  }
  if (!id || !versionId) {
    return (
      <StatusNotice tone="error">
        元になる確定予想バージョンが指定されていません。
      </StatusNotice>
    )
  }
  if (race.state === 'loading' || version.state === 'loading') {
    return <StatusNotice>確定予想と保存済みプランを同期しています…</StatusNotice>
  }
  if (race.error || version.error) {
    return <StatusNotice tone="error">{race.error ?? version.error}</StatusNotice>
  }
  if (!race.value || !version.value || !userId) {
    return (
      <StatusNotice tone="error">
        対象レースまたは確定予想が見つかりません。
      </StatusNotice>
    )
  }

  async function handleSave(data: PurchasePlanWriteData) {
    await savePurchasePlan({ data, raceId: id!, userId: userId! })
  }

  return (
    <div className="space-y-7">
      <Link
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-white"
        to={`/races/${id}/predictions/${versionId}`}
      >
        <ArrowLeft size={16} /> 予想バージョンへ戻る
      </Link>

      <PurchasePlanBuilder
        onSave={handleSave}
        prediction={version.value.snapshot}
        raceName={race.value.name}
        sourcePredictionVersionId={versionId}
        userId={userId}
        versionNumber={version.value.versionNumber}
      />

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Saved snapshots</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
              <History className="text-teal-accent" size={21} /> 保存済み購入プラン
            </h2>
          </div>
          <span className="text-xs text-muted">{savedPlans.value.length}件</span>
        </div>
        {savedPlans.error ? (
          <StatusNotice tone="error">{savedPlans.error}</StatusNotice>
        ) : null}
        {savedPlans.state === 'loading' ? (
          <StatusNotice>保存済みプランを同期しています…</StatusNotice>
        ) : null}
        {savedPlans.state === 'ready' && savedPlans.value.length === 0 ? (
          <div className="mt-4">
            <StatusNotice>保存済みの購入プランはありません。</StatusNotice>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {savedPlans.value.map((plan) => (
            <article className="card-surface p-4" key={plan.planId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {plan.strategy}・元予想 {plan.sourcePredictionVersionId}
                  </p>
                </div>
                <span className="rounded-full bg-navy-900 px-2.5 py-1 text-xs text-teal-accent">
                  不変スナップショット
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">予算</dt>
                  <dd className="mt-1 text-copy">
                    {plan.budgetYen.toLocaleString()}円
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">使用額</dt>
                  <dd className="mt-1 text-copy">
                    {plan.summary.totalStakeYen.toLocaleString()}円
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">期待利益</dt>
                  <dd className="mt-1 text-copy">
                    {Math.round(
                      plan.summary.expectedNetProfitYen,
                    ).toLocaleString()}円
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                保存: {formatTimestamp(plan.createdAt)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
