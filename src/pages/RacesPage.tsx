import { EmptyState } from '../components/EmptyState'
import { PageIntro } from '../components/PageIntro'

export function RacesPage() {
  return (
    <div>
      <PageIntro
        description="開催日・競馬場・登録状態からレースを探し、予想と結果の入口を管理します。"
        eyebrow="Races"
        title="レース"
      />
      <EmptyState
        availableFrom="Phase 1"
        description="現在は開発基盤のみです。レースの登録・検索・詳細表示は、仕様書のPhase 1で実装します。"
        title="登録レースはまだありません"
      />
    </div>
  )
}
