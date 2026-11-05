import { ArrowLeft, FileInput, Pencil, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import { useAuth } from '../features/auth/useAuth'
import { PredictionPreview } from '../features/predictions/PredictionPreview'
import {
  formatTimestamp,
  raceStatusLabels,
  surfaceLabels,
} from '../features/races/presentation'
import {
  usePredictionDraft,
  usePredictionVersions,
  useRace,
} from '../features/races/use-race-data'

export function RaceDetailPage() {
  const { id } = useParams()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const race = useRace(userId, id)
  const draft = usePredictionDraft(userId, id)
  const versions = usePredictionVersions(userId, id)

  if (status !== 'signed-in') {
    return (
      <div className="space-y-5">
        <Link className="inline-flex items-center gap-2 text-sm text-muted" to="/races">
          <ArrowLeft size={16} /> レース一覧へ
        </Link>
        <StatusNotice tone="warning">レース詳細の同期にはGoogleログインが必要です。</StatusNotice>
      </div>
    )
  }

  if (race.state === 'loading') {
    return <StatusNotice>レースを読み込んでいます…</StatusNotice>
  }
  if (race.error) {
    return <StatusNotice tone="error">{race.error}</StatusNotice>
  }
  if (!race.value || !id) {
    return <StatusNotice tone="error">レースが見つかりません。</StatusNotice>
  }

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to="/races">
        <ArrowLeft size={16} /> レース一覧へ
      </Link>

      <section className="card-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">
              {race.value.date} / {race.value.venueCode} {race.value.raceNumber}R
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{race.value.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {surfaceLabels[race.value.surface] ?? race.value.surface}・
              {race.value.distanceM.toLocaleString()}m・{race.value.organizer}
            </p>
          </div>
          <span className="rounded-full bg-teal-accent/10 px-3 py-1.5 text-xs font-bold text-teal-accent">
            {raceStatusLabels[race.value.status]}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="button-primary" to={`/races/${id}/import`}>
            <FileInput size={17} /> 予想JSONを取り込む
          </Link>
          <Link className="button-secondary" to={`/races/${id}/editor`}>
            <Pencil size={17} /> 下書きを編集
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Draft</p>
            <h2 className="mt-1 text-xl font-bold text-white">現在の下書き</h2>
          </div>
          {draft.value ? (
            <p className="text-xs text-muted">
              revision {draft.value.revision}・{formatTimestamp(draft.value.lastEditedAt)}
            </p>
          ) : null}
        </div>
        {draft.state === 'loading' ? <StatusNotice>下書きを同期中です…</StatusNotice> : null}
        {draft.error ? <StatusNotice tone="error">{draft.error}</StatusNotice> : null}
        {draft.value ? (
          <PredictionPreview document={draft.value.payload} />
        ) : draft.state === 'ready' ? (
          <StatusNotice tone="info">予想JSONを取り込むと下書きが作成されます。</StatusNotice>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Versions</p>
            <h2 className="mt-1 text-xl font-bold text-white">確定予想</h2>
          </div>
          <span className="text-xs text-muted">{versions.value.length}件</span>
        </div>
        {versions.error ? <StatusNotice tone="error">{versions.error}</StatusNotice> : null}
        {versions.value.length === 0 ? (
          <StatusNotice>確定済みの予想はありません。</StatusNotice>
        ) : (
          <div className="space-y-3">
            {versions.value.map((version) => (
              <Link
                className="card-surface flex items-center justify-between gap-4 p-4 transition hover:border-teal-accent/50"
                key={version.id}
                to={`/races/${id}/predictions/${version.id}`}
              >
                <div>
                  <p className="font-bold text-white">予想 v{version.versionNumber}</p>
                  <p className="mt-1 text-xs text-muted">{version.changeReason}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-teal-accent">
                  <ShieldCheck size={16} /> 不変スナップショット
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
