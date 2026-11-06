import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  analyzeDashboard,
  availableDashboardOptions,
  emptyDashboardFilters,
} from '../../domain/calculations/dashboard'
import { betTypeLabels } from '../../domain/calculations/expected-value'
import type {
  DashboardFilters,
  DashboardGroupStat,
  DashboardPeriod,
  DashboardSource,
  DashboardTimePoint,
} from '../../domain/types/dashboard'
import { dashboardBetTypes } from '../../domain/types/dashboard'
import { StatusNotice } from '../../components/StatusNotice'

const yen = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

function formatYen(value: number | null) {
  return value === null ? '未算出' : `${yen.format(Math.round(value))}円`
}

function formatPercent(value: number | null, digits = 1) {
  return value === null ? '未算出' : `${value.toFixed(digits)}%`
}

function KpiCard({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="card-surface min-w-0 p-4">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-2 break-words text-xl font-bold text-white">{value}</dd>
      {note ? <p className="mt-1 text-xs leading-5 text-muted">{note}</p> : null}
    </div>
  )
}

function CumulativeProfitChart({ points }: { points: DashboardTimePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-line text-sm text-muted">
        指定期間に収支データがありません。
      </div>
    )
  }
  const values = points.map((point) => point.cumulativeNetProfitYen)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const range = Math.max(1, max - min)
  const x = (index: number) =>
    points.length === 1 ? 50 : 6 + (index / (points.length - 1)) * 88
  const y = (value: number) => 90 - ((value - min) / range) * 78
  const polyline = points
    .map((point, index) => `${x(index)},${y(point.cumulativeNetProfitYen)}`)
    .join(' ')

  return (
    <div>
      <svg
        aria-label="レース開催日基準の累積収支推移"
        className="h-64 w-full overflow-visible"
        role="img"
        viewBox="0 0 100 100"
      >
        <title>累積収支推移。0円基準線を含みます。</title>
        <line
          stroke="#64748b"
          strokeDasharray="2 2"
          strokeWidth="0.5"
          x1="4"
          x2="96"
          y1={y(0)}
          y2={y(0)}
        />
        <polyline
          fill="none"
          points={polyline}
          stroke="#2dd4bf"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {points.map((point, index) => (
          <circle
            fill={point.cumulativeNetProfitYen >= 0 ? '#2dd4bf' : '#fb7185'}
            key={point.key}
            r="1.7"
            cx={x(index)}
            cy={y(point.cumulativeNetProfitYen)}
          >
            <title>
              {point.label}: {formatYen(point.cumulativeNetProfitYen)}
              {point.provisional ? '（未判定を含む暫定値）' : ''}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between gap-2 text-xs text-muted">
        <span>{points[0]?.label}</span>
        <span>0円基準線</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  )
}

function GroupTable({ rows, title }: { rows: DashboardGroupStat[]; title: string }) {
  const maxStake = Math.max(1, ...rows.map((row) => row.stakeYen))
  return (
    <section className="card-surface p-4 sm:p-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">集計できるデータがありません。</p>
      ) : (
        <>
          <div className="mt-4 space-y-3" aria-label={`${title}の購入額棒グラフ`}>
            {rows.map((row) => (
              <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs" key={row.key}>
                <span className="truncate text-copy">{row.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-navy-950">
                  <div
                    className="h-full rounded-full bg-teal-accent"
                    style={{ width: `${(row.stakeYen / maxStake) * 100}%` }}
                  />
                </div>
                <span className="text-muted">{formatYen(row.stakeYen)}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:hidden" data-testid="mobile-analysis-layout">
            {rows.map((row) => (
              <article className="rounded-xl border border-slate-line bg-navy-950/45 p-3" key={row.key}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-white">{row.label}</strong>
                  <span className="text-xs text-muted">{row.ticketCount}件</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted">収支</dt><dd>{formatYen(row.netProfitYen)}</dd></div>
                  <div><dt className="text-muted">回収率</dt><dd>{formatPercent(row.returnRatePercent)}</dd></div>
                  <div><dt className="text-muted">的中率</dt><dd>{formatPercent(row.hitRatePercent)}</dd></div>
                  <div><dt className="text-muted">平均オッズ</dt><dd>{row.averageOdds === null ? '未記録' : decimal.format(row.averageOdds)}</dd></div>
                </dl>
                {row.ticketCount > 0 && row.ticketCount < 10 ? (
                  <p className="mt-2 text-xs text-amber-200">件数が少なく統計的に不安定です。</p>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto lg:block" data-testid="desktop-analysis-layout">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-muted"><tr><th className="py-2">区分</th><th>件数</th><th>購入</th><th>払戻</th><th>返還</th><th>収支</th><th>回収率</th><th>的中率</th><th>平均オッズ</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-slate-line/70" key={row.key}>
                    <th className="py-3 text-copy">{row.label}{row.ticketCount > 0 && row.ticketCount < 10 ? <span className="ml-2 text-amber-200">少数</span> : null}</th>
                    <td>{row.ticketCount}</td><td>{formatYen(row.stakeYen)}</td><td>{formatYen(row.payoutYen)}</td><td>{formatYen(row.refundYen)}</td><td>{formatYen(row.netProfitYen)}</td><td>{formatPercent(row.returnRatePercent)}</td><td>{formatPercent(row.hitRatePercent)}</td><td>{row.averageOdds === null ? '未記録' : decimal.format(row.averageOdds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function Filters({
  filters,
  onChange,
  organizers,
  venues,
}: {
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
  organizers: string[]
  venues: string[]
}) {
  const set = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) =>
    onChange({ ...filters, [key]: value })
  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">Filters</p><h2 className="mt-1 text-lg font-bold text-white">分析条件</h2></div>
        <button className="button-secondary" onClick={() => onChange(emptyDashboardFilters)} type="button">
          <RefreshCw size={15} /> 条件をリセット
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="field-label">開始日<input aria-label="開始日" className="field-input" type="date" value={filters.dateFrom} onChange={(event) => set('dateFrom', event.target.value)} /></label>
        <label className="field-label">終了日<input aria-label="終了日" className="field-input" type="date" value={filters.dateTo} onChange={(event) => set('dateTo', event.target.value)} /></label>
        <label className="field-label">主催者<select aria-label="主催者" className="field-input" value={filters.organizer} onChange={(event) => set('organizer', event.target.value)}><option value="all">すべて</option>{organizers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field-label">競馬場<select aria-label="競馬場" className="field-input" value={filters.venueCode} onChange={(event) => set('venueCode', event.target.value)}><option value="all">すべて</option>{venues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field-label">券種<select aria-label="券種" className="field-input" value={filters.betType} onChange={(event) => set('betType', event.target.value as DashboardFilters['betType'])}><option value="all">すべて</option>{dashboardBetTypes.map((value) => <option key={value} value={value}>{betTypeLabels[value]}</option>)}</select></label>
        <label className="field-label">結果状態<select aria-label="結果状態" className="field-input" value={filters.result} onChange={(event) => set('result', event.target.value as DashboardFilters['result'])}><option value="all">すべて</option><option value="confirmed">判定済み</option><option value="unconfirmed">未判定</option></select></label>
        <label className="field-label">購入プラン<select aria-label="購入プラン" className="field-input" value={filters.plan} onChange={(event) => set('plan', event.target.value as DashboardFilters['plan'])}><option value="all">すべて</option><option value="with_plan">あり</option><option value="without_plan">なし</option></select></label>
      </div>
    </section>
  )
}

export function DashboardView({ source }: { source: DashboardSource }) {
  const [filters, setFilters] = useState<DashboardFilters>(emptyDashboardFilters)
  const [period, setPeriod] = useState<DashboardPeriod>('daily')
  const options = useMemo(() => availableDashboardOptions(source), [source])
  const analysis = useMemo(() => analyzeDashboard(source, filters), [filters, source])
  const { kpi } = analysis

  return (
    <div className="space-y-6">
      {source.truncated ? <StatusNotice tone="warning">読み取りコストを抑えるため、最新200レースだけを集計しています。</StatusNotice> : null}
      <Filters filters={filters} onChange={setFilters} organizers={options.organizers} venues={options.venues} />

      {analysis.filteredRows.length === 0 ? (
        <StatusNotice>指定条件に該当する実購入記録はありません。未登録の値は推測して補完しません。</StatusNotice>
      ) : null}
      {kpi.provisional ? <StatusNotice tone="warning">未判定{kpi.unresolvedCount}件を含むため、損益と推移は既知の入出金だけを使った暫定値です。不的中としては数えていません。</StatusNotice> : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="総購入金額" value={formatYen(kpi.stakeYen)} />
        <KpiCard label="総払戻金" value={formatYen(kpi.payoutYen)} />
        <KpiCard label="総返還金" value={formatYen(kpi.refundYen)} />
        <KpiCard label="実現損益" note={kpi.provisional ? '暫定' : '完全確定'} value={formatYen(kpi.netProfitYen)} />
        <KpiCard label="回収率" value={formatPercent(kpi.returnRatePercent)} />
        <KpiCard label="購入レース数" value={`${kpi.purchasedRaceCount}レース`} />
        <KpiCard label="馬券件数" value={`${kpi.ticketCount}件`} />
        <KpiCard label="的中／不的中" value={`${kpi.hitCount}／${kpi.missCount}件`} />
        <KpiCard label="返還／未判定" value={`${kpi.refundCount}／${kpi.unresolvedCount}件`} />
        <KpiCard label="的中率" note="返還・未判定を除外" value={formatPercent(kpi.hitRatePercent)} />
        <KpiCard label="平均購入額" value={formatYen(kpi.averageStakeYen)} />
        <KpiCard label="平均推定期待回収率" value={formatPercent(kpi.averageExpectedReturnRatePercent)} />
        <KpiCard label="推定期待利益合計" note="購入時点スナップショットの線形和" value={formatYen(kpi.expectedNetProfitYen)} />
      </dl>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Cash flow</p><h2 className="mt-1 text-xl font-bold text-white">累積収支推移</h2><p className="mt-1 text-xs text-muted">購入記録日ではなくレース開催日を基準に集計</p></div>
          <div className="flex rounded-xl border border-slate-line p-1" role="group" aria-label="集計単位">
            {([['daily', '日別'], ['weekly', '週別'], ['monthly', '月別']] as const).map(([value, label]) => <button aria-pressed={period === value} className={`rounded-lg px-3 py-2 text-xs font-semibold ${period === value ? 'bg-teal-accent text-navy-950' : 'text-muted'}`} key={value} onClick={() => setPeriod(value)} type="button">{label}</button>)}
          </div>
        </div>
        <div className="mt-5"><CumulativeProfitChart points={analysis.timeSeries[period]} /></div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {analysis.ledger.comparable && analysis.ledger.matches ? <CheckCircle2 className="mt-0.5 text-emerald-300" size={20} /> : <AlertTriangle className="mt-0.5 text-amber-300" size={20} />}
          <div><h2 className="font-bold text-white">収支台帳との整合性</h2>{analysis.ledger.comparable ? <p className="mt-1 text-sm text-muted">台帳 {formatYen(analysis.ledger.ledgerNetCashYen)}／有効購入・最新結果 {formatYen(analysis.ledger.derivedNetCashYen)}／差額 {formatYen(analysis.ledger.differenceYen)}（{analysis.ledger.transactionCount}取引）</p> : <p className="mt-1 text-sm text-muted">券種・結果状態・プランで明細を絞り込んでいるため、レース単位の台帳とは比較しません。全明細に戻すと照合できます。</p>}</div>
        </div>
      </section>

      <GroupTable rows={analysis.betTypeStats} title="券種別分析（全8券種）" />
      <div className="grid gap-6 xl:grid-cols-2"><GroupTable rows={analysis.organizerStats} title="主催者別分析" /><GroupTable rows={analysis.venueStats} title="競馬場別分析" /></div>

      <section className="card-surface p-4 sm:p-5">
        <p className="eyebrow">Expected vs actual</p><h2 className="mt-1 text-xl font-bold text-white">期待値と実績</h2>
        <StatusNotice>期待値は推定確率に基づく事前評価、実績は確定払戻に基づく結果です。単一レースの差だけで予想能力を判断しません。</StatusNotice>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-muted"><tr><th className="py-2">レース</th><th>券種・組合せ</th><th>推定確率</th><th>観測オッズ</th><th>期待回収率</th><th>期待利益</th><th>購入額</th><th>実払戻</th><th>実損益</th><th>結果</th></tr></thead><tbody>{analysis.filteredRows.slice(0, 100).map((row) => <tr className="border-t border-slate-line/70" key={`${row.purchaseId}:${row.itemId}`}><td className="py-3">{row.raceDate}<br/><span className="text-muted">{row.raceName}</span></td><td>{betTypeLabels[row.betType]} {row.selections.join('-')}</td><td>{row.hitProbability === null ? '未算出' : formatPercent(row.hitProbability * 100)}</td><td>{row.odds === null ? '未記録' : `${row.odds.toFixed(1)}倍`}<br/><span className="text-muted">{row.oddsObservedAt ?? '観測日時なし'}</span></td><td>{formatPercent(row.expectedReturnRatePercent)}</td><td>{formatYen(row.expectedNetProfitYen)}</td><td>{formatYen(row.stakeYen)}</td><td>{formatYen(row.payoutYen + row.refundYen)}</td><td>{formatYen(row.netProfitYen)}</td><td>{row.settlementStatus === 'hit' ? '的中' : row.settlementStatus === 'miss' ? '不的中' : row.settlementStatus === 'refund' ? '返還' : '未判定'}</td></tr>)}</tbody></table></div>
        {analysis.filteredRows.length > 100 ? <p className="mt-3 text-xs text-muted">画面負荷を抑えるため、明細は先頭100件を表示しています。</p> : null}
      </section>

      <section className="card-surface p-4 sm:p-5">
        <p className="eyebrow">Calibration</p><h2 className="mt-1 text-xl font-bold text-white">予想的中確率の精度</h2>
        <p className="mt-2 text-sm text-muted">Brier Score: {analysis.calibration.brierScore === null ? '未算出' : analysis.calibration.brierScore.toFixed(4)}／対象候補 {analysis.calibration.sampleCount}件</p>
        <p className="mt-1 text-xs leading-5 text-muted">同一候補の重複購入 {analysis.calibration.duplicateCandidateCount}件と、予想確定が購入前と確認できない {analysis.calibration.excludedChronologyCount}件を除外。少数データでは精度を断定できません。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">{analysis.calibration.bands.map((band) => <article className="rounded-xl border border-slate-line bg-navy-950/45 p-3" key={band.label}><p className="text-xs font-bold text-teal-accent">{band.label}</p><p className="mt-2 text-lg font-bold text-white">{band.count}件</p><p className="mt-2 text-xs text-muted">平均推定 {band.averageProbability === null ? '—' : formatPercent(band.averageProbability * 100)}</p><p className="text-xs text-muted">実際的中 {band.actualHitRate === null ? '—' : formatPercent(band.actualHitRate * 100)}</p><p className="text-xs text-muted">差 {band.difference === null ? '—' : formatPercent(band.difference * 100)}</p></article>)}</div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <p className="eyebrow">Pace review</p><h2 className="mt-1 text-xl font-bold text-white">展開予想の振り返り</h2>
        <p className="mt-2 text-sm leading-6 text-muted">実際のペースが確認済みのレースだけを対象に、複数シナリオのうち実際のペースへ割り当てた確率を合算します。最大確率シナリオだけで正誤判定せず、馬券別の条件付き確率は生成しません。</p>
        {analysis.scenarioReviews.length === 0 ? <p className="mt-4 text-sm text-muted">比較可能な確認済みペースがありません。</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{analysis.scenarioReviews.map((review) => <article className="rounded-xl border border-slate-line bg-navy-950/45 p-3" key={`${review.raceId}:${review.predictionVersionId}`}><strong className="text-white">{review.raceName}</strong><p className="mt-1 text-xs text-muted">実際: {review.observedPace}／一致ペースへ割り当てた予想確率 {formatPercent(review.matchingProbability * 100)}</p></article>)}</div>}
      </section>
    </div>
  )
}
