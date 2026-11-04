import { EmptyState } from '../components/EmptyState'
import { PageIntro } from '../components/PageIntro'

export function AnalyticsPage() {
  return (
    <div>
      <PageIntro
        description="収支・回収率・券種や条件別の傾向を、対象件数とともに確認します。"
        eyebrow="Analytics"
        title="分析"
      />
      <EmptyState
        availableFrom="Phase 2–3"
        description="分析指標は実購入と結果のデータが揃ってから追加します。根拠のない確率や利益保証は表示しません。"
        title="分析できるデータがありません"
      />
    </div>
  )
}
