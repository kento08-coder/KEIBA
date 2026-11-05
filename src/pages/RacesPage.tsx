import { CalendarPlus, ChevronRight, Cloud, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { StatusNotice } from '../components/StatusNotice'
import { useAuth } from '../features/auth/useAuth'
import {
  RaceRegistrationSchema,
  type RaceRegistrationInput,
} from '../features/races/model'
import {
  raceStatusLabels,
  surfaceLabels,
} from '../features/races/presentation'
import { useRaces } from '../features/races/use-race-data'
import {
  createRace,
  DuplicateRaceError,
} from '../infrastructure/repositories/race-repository'

const initialForm: RaceRegistrationInput = {
  date: new Date().toISOString().slice(0, 10),
  distanceM: 1600,
  name: '',
  organizer: 'JRA',
  raceNumber: 1,
  surface: 'turf',
  venueCode: '',
}

export function RacesPage() {
  const { signIn, status, user } = useAuth()
  const userId = user?.uid ?? null
  const races = useRaces(userId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<RaceRegistrationInput>(initialForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) {
      setFormError('レース登録にはGoogleログインが必要です。')
      return
    }
    const parsed = RaceRegistrationSchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? '入力内容を確認してください。')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await createRace(userId, parsed.data)
      setForm(initialForm)
      setShowForm(false)
    } catch (error) {
      setFormError(
        error instanceof DuplicateRaceError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'レースを登録できませんでした。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageIntro
        action={
          <button
            className="button-primary"
            onClick={() => setShowForm((visible) => !visible)}
            type="button"
          >
            <Plus size={18} /> レース登録
          </button>
        }
        description="レースを登録し、予想JSONの取り込み・編集・確定版の管理へ進みます。"
        eyebrow="Races"
        title="レース"
      />

      {status !== 'signed-in' ? (
        <div className="mt-6">
          <StatusNotice tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>クラウド上のレースを表示・登録するにはGoogleログインが必要です。</span>
              <button className="button-secondary" onClick={() => void signIn()} type="button">
                Googleでログイン
              </button>
            </div>
          </StatusNotice>
        </div>
      ) : null}

      {showForm ? (
        <form className="card-surface mt-6 p-5" onSubmit={(event) => void submit(event)}>
          <div className="flex items-center gap-3">
            <CalendarPlus className="text-teal-accent" size={20} />
            <div>
              <h2 className="font-bold text-white">新しいレース</h2>
              <p className="mt-1 text-xs text-muted">未確認の値を推測せず、公式出馬表に合わせて入力してください。</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field-label">
              開催日
              <input className="field-input" onChange={(event) => setForm({ ...form, date: event.target.value })} required type="date" value={form.date} />
            </label>
            <label className="field-label">
              主催者コード
              <input className="field-input uppercase" maxLength={20} onChange={(event) => setForm({ ...form, organizer: event.target.value.toUpperCase() })} placeholder="JRA / NAR" required value={form.organizer} />
            </label>
            <label className="field-label">
              競馬場コード
              <input className="field-input uppercase" maxLength={30} onChange={(event) => setForm({ ...form, venueCode: event.target.value.toUpperCase() })} placeholder="TOKYO" required value={form.venueCode} />
            </label>
            <label className="field-label">
              レース番号
              <input className="field-input" max={99} min={1} onChange={(event) => setForm({ ...form, raceNumber: Number(event.target.value) })} required type="number" value={form.raceNumber} />
            </label>
            <label className="field-label sm:col-span-2">
              レース名
              <input className="field-input" maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
            </label>
            <label className="field-label">
              コース
              <select
                className="field-input"
                onChange={(event) => setForm({ ...form, surface: event.target.value as RaceRegistrationInput['surface'] })}
                value={form.surface}
              >
                <option value="turf">芝</option><option value="dirt">ダート</option><option value="obstacle">障害</option><option value="other">その他</option><option value="unknown">未確認</option>
              </select>
            </label>
            <label className="field-label">
              距離（m）
              <input className="field-input" max={20000} min={100} onChange={(event) => setForm({ ...form, distanceM: Number(event.target.value) })} required type="number" value={form.distanceM} />
            </label>
          </div>
          {formError ? <div className="mt-4"><StatusNotice tone="error">{formError}</StatusNotice></div> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button className="button-secondary" onClick={() => setShowForm(false)} type="button">キャンセル</button>
            <button className="button-primary" disabled={submitting || !userId} type="submit">{submitting ? '登録中…' : '登録する'}</button>
          </div>
        </form>
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="eyebrow">Cloud races</p><h2 className="mt-1 text-xl font-bold text-white">登録済みレース</h2></div>
          {status === 'signed-in' ? <span className="inline-flex items-center gap-2 text-xs text-muted"><Cloud size={15} /> リアルタイム同期</span> : null}
        </div>
        {races.state === 'loading' ? <StatusNotice>レース一覧を同期中です…</StatusNotice> : null}
        {races.error ? <StatusNotice tone="error">{races.error}</StatusNotice> : null}
        {races.state === 'ready' && races.value.length === 0 ? <StatusNotice>登録レースはまだありません。「レース登録」から開始してください。</StatusNotice> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {races.value.map((race) => (
            <Link className="card-surface flex min-w-0 items-center justify-between gap-4 p-4 transition hover:border-teal-accent/50" key={race.raceId} to={`/races/${race.raceId}`}>
              <div className="min-w-0">
                <p className="text-xs font-bold text-teal-accent">{race.date} / {race.venueCode} {race.raceNumber}R</p>
                <h3 className="mt-2 truncate font-bold text-white">{race.name}</h3>
                <p className="mt-1 text-sm text-muted">{surfaceLabels[race.surface] ?? race.surface} {race.distanceM.toLocaleString()}m・{raceStatusLabels[race.status]}</p>
              </div>
              <ChevronRight className="shrink-0 text-muted" size={20} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
