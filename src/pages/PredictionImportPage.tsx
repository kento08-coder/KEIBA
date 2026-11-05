import { ArrowLeft, ClipboardPaste, FileJson, Upload } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StatusNotice } from '../components/StatusNotice'
import type { PredictionDocument } from '../domain/types/import'
import {
  parseAndValidateImportJson,
  type ImportValidationResult,
} from '../domain/validation/import'
import { useAuth } from '../features/auth/useAuth'
import { PredictionPreview } from '../features/predictions/PredictionPreview'
import { usePredictionDraft, useRace } from '../features/races/use-race-data'
import { getClientId } from '../infrastructure/client-id'
import {
  DuplicateImportError,
  importPredictionDraft,
} from '../infrastructure/repositories/race-repository'

interface ValidPrediction {
  document: PredictionDocument
  warnings: Array<{ code: string; message: string; path: string }>
}
function predictionFromResult(result: ImportValidationResult): ValidPrediction | null {
  if (!result.success || result.data.document_type !== 'prediction') {
    return null
  }
  return { document: result.data, warnings: result.warnings }
}

export function PredictionImportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, user } = useAuth()
  const userId = user?.uid ?? null
  const race = useRace(userId, id)
  const draft = usePredictionDraft(userId, id)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportValidationResult | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const validate = () => {
    setLocalError(null)
    const nextResult = parseAndValidateImportJson(text)
    if (nextResult.success && nextResult.data.document_type !== 'prediction') {
      setLocalError('この画面ではprediction JSONだけを取り込めます。')
    } else if (nextResult.success && id && nextResult.data.race_id !== id) {
      setLocalError('JSONのrace_idが表示中のレースと一致しません。')
    }
    setResult(nextResult)
  }

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setFileName(file.name)
    setText(await file.text())
    setResult(null)
    setLocalError(null)
  }

  const importDraft = async () => {
    const valid = result ? predictionFromResult(result) : null
    if (!valid || !userId || !id || localError || draft.state !== 'ready') {
      return
    }
    setImporting(true)
    setLocalError(null)
    try {
      await importPredictionDraft({
        clientId: getClientId(),
        expectedRevision: draft.value?.revision ?? 0,
        payload: valid.document,
        raceId: id,
        sourceFileName: fileName,
        userId,
      })
      navigate(`/races/${id}/editor`)
    } catch (error) {
      setLocalError(
        error instanceof DuplicateImportError
          ? error.message
          : error instanceof Error
            ? error.message
            : '下書きへ反映できませんでした。',
      )
    } finally {
      setImporting(false)
    }
  }

  const validPrediction = result ? predictionFromResult(result) : null
  const canImport =
    Boolean(validPrediction) &&
    !localError &&
    status === 'signed-in' &&
    draft.state === 'ready'

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted hover:text-white" to={id ? `/races/${id}` : '/races'}>
        <ArrowLeft size={16} /> レース詳細へ
      </Link>
      <div>
        <p className="eyebrow">Prediction import</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">予想JSONを取り込む</h1>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          ファイルまたは貼り付け内容を同じZodスキーマで検証し、保存前に展開・各馬・馬券候補を確認します。
        </p>
      </div>

      {race.value ? (
        <StatusNotice>
          対象: {race.value.date} {race.value.venueCode} {race.value.raceNumber}R「{race.value.name}」
        </StatusNotice>
      ) : null}
      {status !== 'signed-in' ? <StatusNotice tone="warning">プレビューはできますが、下書きへの保存にはGoogleログインが必要です。</StatusNotice> : null}

      <section className="card-surface p-5">
        <div className="grid gap-4 lg:grid-cols-[0.32fr_0.68fr]">
          <div className="rounded-xl border border-dashed border-slate-line bg-navy-900/60 p-5">
            <FileJson className="text-teal-accent" size={24} />
            <h2 className="mt-3 font-bold text-white">JSONファイル</h2>
            <p className="mt-2 text-sm leading-6 text-muted">UTF-8・最大1 MiB。選択後も検証ボタンを押すまで保存しません。</p>
            <label className="button-secondary mt-4 cursor-pointer">
              <Upload size={17} /> ファイルを選択
              <input accept="application/json,.json" className="sr-only" onChange={(event) => void selectFile(event)} type="file" />
            </label>
            {fileName ? <p className="mt-3 break-all text-xs text-muted">{fileName}</p> : null}
          </div>
          <label className="field-label">
            <span className="inline-flex items-center gap-2"><ClipboardPaste size={17} /> JSONテキスト</span>
            <textarea
              className="field-input min-h-72 font-mono text-xs leading-5"
              onChange={(event) => {
                setText(event.target.value)
                setFileName(null)
                setResult(null)
                setLocalError(null)
              }}
              placeholder="予想JSONをここに貼り付け"
              spellCheck={false}
              value={text}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="button-primary" disabled={!text.trim()} onClick={validate} type="button">検証してプレビュー</button>
        </div>
      </section>

      {localError ? <StatusNotice tone="error">{localError}</StatusNotice> : null}
      {result && !result.success ? (
        <section className="card-surface border-rose-400/30 p-5">
          <h2 className="font-bold text-rose-100">検証エラー（{result.errors.length}件）</h2>
          <ul className="mt-3 space-y-2 text-sm text-rose-100">
            {result.errors.map((error, index) => (
              <li className="rounded-lg bg-rose-400/10 p-3" key={`${error.path}-${index}`}>
                <code className="text-xs">{error.path}</code><span className="mx-2">—</span>{error.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {validPrediction ? (
        <>
          {validPrediction.warnings.length > 0 ? (
            <section className="card-surface border-amber-400/30 p-5">
              <h2 className="font-bold text-amber-100">警告（保存可能・要確認）</h2>
              <ul className="mt-3 space-y-2 text-sm text-amber-100">
                {validPrediction.warnings.map((warning, index) => (
                  <li className="rounded-lg bg-amber-400/10 p-3" key={`${warning.path}-${index}`}>
                    <code className="text-xs">{warning.path}</code><span className="mx-2">—</span>{warning.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : <StatusNotice tone="success">Zod検証を通過しました。警告はありません。</StatusNotice>}
          <PredictionPreview document={validPrediction.document} />
          <div className="sticky bottom-20 z-10 rounded-2xl border border-slate-line bg-navy-950/95 p-4 shadow-2xl backdrop-blur md:bottom-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">確定版は変更せず、現在の編集可能な下書きへ反映します。</p>
              <button className="button-primary" disabled={!canImport || importing} onClick={() => void importDraft()} type="button">
                {importing ? '反映中…' : '下書きへ反映'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
