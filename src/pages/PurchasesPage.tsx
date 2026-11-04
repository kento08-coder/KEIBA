import { EmptyState } from '../components/EmptyState'
import { PageIntro } from '../components/PageIntro'

export function PurchasesPage() {
  return (
    <div>
      <PageIntro
        description="購入候補・提案プラン・実購入記録を分けて確認するための入口です。外部サービスでの自動購入は行いません。"
        eyebrow="Purchases"
        title="購入"
      />
      <EmptyState
        availableFrom="Phase 1"
        description="購入プラン生成と実購入の記録はPhase 1で実装します。本画面から馬券を自動注文する機能は追加しません。"
        title="購入記録はまだありません"
      />
    </div>
  )
}
