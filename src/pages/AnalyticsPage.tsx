import { PageIntro } from '../components/PageIntro'
import { StatusNotice } from '../components/StatusNotice'
import { DashboardView } from '../features/dashboard/DashboardView'
import { useDashboardData } from '../features/dashboard/use-dashboard-data'
import { useAuth } from '../features/auth/useAuth'

export function AnalyticsPage() {
  const { status, user } = useAuth()
  const dashboard = useDashboardData(user?.uid ?? null)

  return (
    <div className="space-y-6">
      <PageIntro
        description="有効な実購入と最新の確定結果を基に、収支・回収率・期待値・予想確率の較正を振り返ります。"
        eyebrow="Analytics"
        title="分析"
      />
      {status !== 'signed-in' ? (
        <StatusNotice tone="warning">個人の購入・結果データを分析するにはGoogleログインが必要です。</StatusNotice>
      ) : null}
      {dashboard.status === 'loading' ? <StatusNotice>レース、購入、結果、台帳を同期して集計しています…</StatusNotice> : null}
      {dashboard.status === 'error' ? <StatusNotice tone="error">{dashboard.error}</StatusNotice> : null}
      {dashboard.status === 'ready' ? <DashboardView source={dashboard.source} /> : null}
    </div>
  )
}
