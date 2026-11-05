import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { StatusNotice } from '../components/StatusNotice'
import { useAuth } from '../features/auth/useAuth'
import { useRaces } from '../features/races/use-race-data'

export function PurchasesPage() {
  const { user } = useAuth()
  const races = useRaces(user?.uid ?? null)
  return (
    <div className="space-y-6">
      <PageIntro
        description="購入候補・提案プラン・実購入記録を分けて確認するための入口です。外部サービスでの自動購入は行いません。"
        eyebrow="Purchases"
        title="購入"
      />
      {!user ? <StatusNotice tone="warning">購入記録の同期にはGoogleログインが必要です。</StatusNotice> : null}
      {races.error ? <StatusNotice tone="error">{races.error}</StatusNotice> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {races.value.map((race) => (
          <article className="card-surface p-4" key={race.raceId}>
            <p className="font-bold text-white">{race.name}</p>
            <p className="mt-1 text-xs text-muted">{race.date}・{race.venueCode} {race.raceNumber}R・{race.status}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/races/${race.raceId}/purchases`}>実購入記録</Link>
              <Link className="button-secondary" to={`/races/${race.raceId}/results`}>結果・払戻</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
