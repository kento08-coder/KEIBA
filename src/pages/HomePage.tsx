import { ArrowUpRight, CalendarDays, CircleDollarSign, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { SampleBadge } from '../components/SampleBadge'

const sampleMetrics = [
  { label: '累計購入', value: '¥12,000', icon: CircleDollarSign },
  { label: '累計払戻', value: '¥13,680', icon: ArrowUpRight },
  { label: '収支', value: '+¥1,680', icon: Target },
  { label: '回収率', value: '114.0%', icon: CalendarDays },
]

export function HomePage() {
  return (
    <div>
      <PageIntro
        action={<SampleBadge />}
        description="成績と登録レースをひと目で確認できるダッシュボードです。現在はPhase 0のUI確認用サンプルを表示しています。"
        eyebrow="Dashboard"
        title="ホーム"
      />

      <section
        aria-label="サンプル成績"
        className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {sampleMetrics.map(({ icon: Icon, label, value }) => (
          <article className="card-surface p-4 sm:p-5" key={label}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
              <Icon aria-hidden="true" className="text-teal-accent" size={18} />
            </div>
            <p className="mt-4 text-xl font-bold text-white sm:text-2xl">{value}</p>
          </article>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="card-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-line/70 p-5">
            <div>
              <p className="eyebrow">Upcoming</p>
              <h2 className="mt-1 text-lg font-bold text-white">登録レース</h2>
            </div>
            <SampleBadge />
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <article className="rounded-xl border border-slate-line/70 bg-navy-900/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-teal-accent">2026.11.08 / 東京 11R</p>
                  <h3 className="mt-2 font-bold text-white">サンプルステークス</h3>
                  <p className="mt-1 text-sm text-muted">芝 2,000m・予想未登録</p>
                </div>
                <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
                  準備中
                </span>
              </div>
            </article>
            <p className="text-xs leading-5 text-muted">
              このレースは架空のUIサンプルです。実データの登録はPhase 1で実装します。
            </p>
          </div>
        </section>

        <section className="card-surface p-5">
          <p className="eyebrow">Next step</p>
          <h2 className="mt-2 text-lg font-bold text-white">Phase 1でできること</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>・レース情報の登録と編集</li>
            <li>・予想JSONの検証と取り込み</li>
            <li>・購入プランの比較と記録</li>
            <li>・結果登録と収支反映</li>
          </ul>
          <Link className="button-secondary mt-6 w-full" to="/settings">
            Firebase設定を確認
          </Link>
        </section>
      </div>
    </div>
  )
}
