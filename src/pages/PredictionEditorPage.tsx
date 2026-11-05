import { AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, Save, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import type { PredictionDocument } from '../domain/types/import'
import { validateImportDocument } from '../domain/validation/import'
import { useAuth } from '../features/auth/useAuth'
import { PredictionEditorForm } from '../features/predictions/PredictionEditorForm'
import { usePredictionDraft } from '../features/races/use-race-data'
import { getClientId } from '../infrastructure/client-id'
import {
  DraftConflictError,
  finalizePrediction,
  savePredictionDraft,
} from '../infrastructure/repositories/race-repository'

type SaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'invalid' | 'error' | 'conflict'

const saveLabels: Record<SaveState, string> = {
  loading: '同期中', saved: '保存済み', unsaved: '未保存の変更', saving: '保存中', invalid: '入力エラー', error: '保存失敗', conflict: '競合を検出',
}
export function PredictionEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const remoteDraft = usePredictionDraft(userId, id)
  const clientId = useMemo(() => getClientId(), [])
  const [payload, setPayload] = useState<PredictionDocument | null>(null)
  const [baseRevision, setBaseRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [changeReason, setChangeReason] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [showFinalize, setShowFinalize] = useState(false)
  const changeSequence = useRef(0)

  const validation = useMemo(
    () => (payload ? validateImportDocument(payload) : null),
    [payload],
  )

  /* Firestore snapshots are an external system; mirror them into the local editor only when safe. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const remote = remoteDraft.value
    if (!remote) {
      return
    }
    if (!payload) {
      setPayload(remote.payload)
      setBaseRevision(remote.revision)
      setSaveState('saved')
      return
    }
    if (remote.revision <= baseRevision) {
      return
    }
    if (remote.lastEditedByClient === clientId) {
      setBaseRevision(remote.revision)
      return
    }
    if (dirty) {
      setSaveState('conflict')
      setSaveError('別の端末またはタブで下書きが更新されました。自動保存を停止しています。')
      return
    }
    setPayload(remote.payload)
    setBaseRevision(remote.revision)
    setSaveState('saved')
  }, [baseRevision, clientId, dirty, payload, remoteDraft.value])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (
      !dirty ||
      !payload ||
      !userId ||
      !id ||
      saveState === 'conflict' ||
      saveState === 'error' ||
      saveState === 'saving'
    ) {
      return undefined
    }
    if (!validation?.success) {
      return undefined
    }
    const sequence = changeSequence.current
    const timeout = window.setTimeout(() => {
      setSaveState('saving')
      setSaveError(null)
      void savePredictionDraft({
        clientId,
        expectedRevision: baseRevision,
        payload,
        raceId: id,
        userId,
      })
        .then((revision) => {
          setBaseRevision(revision)
          if (sequence === changeSequence.current) {
            setDirty(false)
            setSaveState('saved')
          } else {
            setSaveState('unsaved')
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DraftConflictError) {
            setSaveState('conflict')
          } else {
            setSaveState('error')
          }
          setSaveError(error instanceof Error ? error.message : '下書きを保存できませんでした。')
        })
    }, 1200)
    return () => window.clearTimeout(timeout)
  }, [baseRevision, clientId, dirty, id, payload, saveState, userId, validation])

  const updatePayload = (next: PredictionDocument) => {
    changeSequence.current += 1
    setPayload(next)
    setDirty(true)
    setSaveState('unsaved')
    setSaveError(null)
  }

  const loadCloudDraft = () => {
    if (!remoteDraft.value) {
      return
    }
    changeSequence.current += 1
    setPayload(remoteDraft.value.payload)
    setBaseRevision(remoteDraft.value.revision)
    setDirty(false)
    setSaveState('saved')
    setSaveError(null)
  }

  const finalize = async () => {
    if (!userId || !id || !payload || dirty || !validation?.success || !changeReason.trim()) {
      return
    }
    setFinalizing(true)
    setSaveError(null)
    try {
      const created = await finalizePrediction({
        changeReason,
        clientId,
        expectedRevision: baseRevision,
        raceId: id,
        userId,
      })
      navigate(`/races/${id}/predictions/${created.versionId}`)
    } catch (error) {
      if (error instanceof DraftConflictError) {
        setSaveState('conflict')
      }
      setSaveError(error instanceof Error ? error.message : '予想を確定できませんでした。')
    } finally {
      setFinalizing(false)
    }
  }

  if (status !== 'signed-in') {
    return <StatusNotice tone="warning">下書き編集にはGoogleログインが必要です。</StatusNotice>
  }
  if (
    remoteDraft.state === 'loading' ||
    (remoteDraft.value !== null && saveState === 'loading')
  ) {
    return <StatusNotice>下書きを同期しています…</StatusNotice>
  }
  if (remoteDraft.error) {
    return <StatusNotice tone="error">{remoteDraft.error}</StatusNotice>
  }
  if (!remoteDraft.value || !payload || !id) {
    return (
      <div className="space-y-4">
        <StatusNotice tone="warning">編集できる下書きがありません。予想JSONを先に取り込んでください。</StatusNotice>
        <Link className="button-primary" to={id ? `/races/${id}/import` : '/races'}>予想JSONを取り込む</Link>
      </div>
    )
  }

  const errors = validation && !validation.success ? validation.errors : []
  const warnings = validation?.success ? validation.warnings : []
  const displayedSaveState = errors.length > 0 ? 'invalid' : saveState
  const canFinalize = saveState === 'saved' && !dirty && validation?.success

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to={`/races/${id}`}><ArrowLeft size={16} /> レース詳細へ</Link>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${displayedSaveState === 'saved' ? 'border-emerald-400/30 text-emerald-200' : displayedSaveState === 'conflict' || displayedSaveState === 'error' ? 'border-rose-400/30 text-rose-200' : 'border-amber-400/30 text-amber-200'}`}>
          {displayedSaveState === 'saved' ? <Check size={15} /> : displayedSaveState === 'conflict' ? <CloudOff size={15} /> : <Save size={15} />}{saveLabels[displayedSaveState]}・revision {baseRevision}
        </div>
      </div>
      <div>
        <p className="eyebrow">Draft editor</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">予想下書きを編集</h1>
        <p className="mt-2 leading-7 text-muted">変更は検証通過後、1.2秒でクラウドへ自動保存されます。不明値は空欄のまま保持します。</p>
      </div>

      {saveError ? (
        <StatusNotice tone={saveState === 'conflict' ? 'warning' : 'error'}>
          <div className="flex flex-wrap items-center justify-between gap-3"><span>{saveError}</span>{saveState === 'conflict' ? <button className="button-secondary" onClick={loadCloudDraft} type="button">クラウド版を読み込む</button> : null}</div>
        </StatusNotice>
      ) : null}
      {errors.length > 0 ? (
        <StatusNotice tone="error"><div className="flex items-start gap-2"><AlertTriangle className="mt-1 shrink-0" size={17} /><div><p className="font-bold">{errors.length}件の検証エラーがあるため自動保存を停止中です。</p><ul className="mt-2 list-disc pl-5">{errors.slice(0, 8).map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code>: {error.message}</li>)}</ul></div></div></StatusNotice>
      ) : null}
      {warnings.length > 0 ? <StatusNotice tone="warning">{warnings.length}件の警告があります。不明な確率・オッズは自動補完されません。</StatusNotice> : null}
      <PredictionEditorForm disabled={saveState === 'conflict'} onChange={updatePayload} value={payload} />

      <section className="card-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2"><ShieldCheck className="text-teal-accent" size={20} /><h2 className="font-bold text-white">新しい確定版を作成</h2></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">現在の下書きを不変スナップショットとして追加します。既存の確定版は上書きされません。</p></div>
          <button className="button-primary" disabled={!canFinalize} onClick={() => setShowFinalize(true)} type="button"><Cloud size={17} /> 予想を確定</button>
        </div>
        {showFinalize ? (
          <div className="mt-5 rounded-xl border border-teal-accent/30 bg-teal-accent/5 p-4">
            <label className="field-label">変更理由<input className="field-input" maxLength={500} onChange={(event) => setChangeReason(event.target.value)} placeholder="例: 当日オッズと馬場状態を反映" value={changeReason} /></label>
            <div className="mt-4 flex justify-end gap-2"><button className="button-secondary" onClick={() => setShowFinalize(false)} type="button">戻る</button><button className="button-primary" disabled={!changeReason.trim() || finalizing} onClick={() => void finalize()} type="button">{finalizing ? '確定中…' : '不変バージョンを作成'}</button></div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
