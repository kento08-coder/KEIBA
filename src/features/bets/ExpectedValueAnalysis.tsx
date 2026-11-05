import { AlertTriangle, Calculator, CircleHelp } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  betTypeLabels,
  evaluateBetCandidates,
  expectedValueUnavailableLabels,
  rankBetCandidatesByExpectedReturn,
  type BetCandidateExpectedValue,
} from '../../domain/calculations/expected-value'
import type { PredictionDocument } from '../../domain/types/import'
import { StatusNotice } from '../../components/StatusNotice'

type SortMode = 'expected_return' | 'source_order'

const probabilitySourceLabels = {
  ai_estimate: 'AI推定',
  user_estimate: 'ユーザー推定',
  model_estimate: 'モデル推定',
  unset: '未設定',
} as const

const classificationLabels = {
  positive: '推定プラス期待値',
  break_even: '推定損益分岐',
  negative: '推定マイナス期待値',
} as const

function percent(value: number, fractionDigits = 1) {
  return `${(value * 100).toFixed(fractionDigits)}%`
}

function yen(value: number) {
  return `${Math.round(value).toLocaleString('ja-JP')}円`
}

function odds(value: number | null) {
  return value === null ? '未設定' : `${value.toFixed(1)}倍`
}

function probability(value: number | null) {
  return value === null ? '未設定' : percent(value)
}

function selection(entry: BetCandidateExpectedValue) {
  return entry.candidate.horse_numbers.join('-')
}

function isHighlyUncertain(entry: BetCandidateExpectedValue) {
  return (
    entry.candidate.confidence === 'low' ||
    entry.candidate.confidence === 'unknown'
  )
}

function calculationStatus(entry: BetCandidateExpectedValue) {
  if (entry.evaluation.status === 'unavailable') {
    return `未算出: ${expectedValueUnavailableLabels[entry.evaluation.reason]}`
  }
  return classificationLabels[entry.evaluation.metrics.classification]
}

function CandidateCard({ entry }: { entry: BetCandidateExpectedValue }) {
  const metrics =
    entry.evaluation.status === 'calculated' ? entry.evaluation.metrics : null
  return (
    <article className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-teal-accent">
            {betTypeLabels[entry.candidate.bet_type]}
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">
            {selection(entry)}
          </h3>
        </div>
        <span className="rounded-full border border-slate-line px-2.5 py-1 text-[11px] font-bold text-copy">
          {calculationStatus(entry)}
        </span>
      </div>
      {metrics ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-navy-900 p-3">
            <dt className="text-muted">期待回収率</dt>
            <dd className="mt-1 font-bold text-white">
              {metrics.expectedReturnRatePercent.toFixed(1)}%
            </dd>
          </div>
          <div className="rounded-lg bg-navy-900 p-3">
            <dt className="text-muted">100円あたり期待利益</dt>
            <dd className="mt-1 font-bold text-white">
              {yen(metrics.expectedNetProfitYen)}
            </dd>
          </div>
          <div className="rounded-lg bg-navy-900 p-3">
            <dt className="text-muted">推定確率 / 分岐確率</dt>
            <dd className="mt-1 font-semibold text-copy">
              {probability(entry.candidate.hit_probability)} /{' '}
              {percent(metrics.breakEvenProbability)}
            </dd>
          </div>
          <div className="rounded-lg bg-navy-900 p-3">
            <dt className="text-muted">観測時点のオッズ / 優位幅</dt>
            <dd className="mt-1 font-semibold text-copy">
              {odds(entry.candidate.odds)} / {percent(metrics.probabilityEdge)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 rounded-lg bg-navy-900 p-3 text-sm leading-6 text-muted">
          {calculationStatus(entry)}
        </p>
      )}
      <div className="mt-4 space-y-1 text-xs text-muted">
        <p>
          確率の出所: {probabilitySourceLabels[entry.candidate.probability_source]}
          ・確信度: {entry.candidate.confidence}
        </p>
        <p>
          観測時点のオッズ日時:{' '}
          {entry.candidate.odds_observed_at ?? '観測日時なし'}
        </p>
        {isHighlyUncertain(entry) ? (
          <p className="font-bold text-amber-200">不確実性が高い推定です。</p>
        ) : null}
      </div>
    </article>
  )
}

export function ExpectedValueAnalysis({
  prediction,
}: {
  prediction: PredictionDocument
}) {
  const [sortMode, setSortMode] = useState<SortMode>('expected_return')
  const entries = useMemo(
    () =>
      sortMode === 'expected_return'
        ? rankBetCandidatesByExpectedReturn(prediction.bet_candidates, 100)
        : evaluateBetCandidates(prediction.bet_candidates, 100),
    [prediction.bet_candidates, sortMode],
  )
  const calculatedCount = entries.filter(
    (entry) => entry.evaluation.status === 'calculated',
  ).length

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Expected value</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
            <Calculator className="text-teal-accent" size={21} />
            期待値分析
          </h2>
          <p className="mt-2 text-sm text-muted">
            算出可能 {calculatedCount}件 / 全{entries.length}件
          </p>
        </div>
        <label className="field-label min-w-52">
          並び順
          <select
            className="field-input"
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="expected_return">期待回収率の高い順</option>
            <option value="source_order">予想JSONの登録順</option>
          </select>
        </label>
      </div>

      <StatusNotice tone="warning">
        <span className="inline-flex items-start gap-2">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          <span>
            期待値は推定的中確率と観測時点のオッズに基づく参考値です。利益や的中を保証せず、期待回収率が高い候補の購入を推奨する表示ではありません。
          </span>
        </span>
      </StatusNotice>

      {entries.length === 0 ? (
        <StatusNotice>馬券候補がないため、期待値は算出できません。</StatusNotice>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {entries.map((entry) => (
              <CandidateCard entry={entry} key={entry.candidate.id} />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-line/80 md:block">
            <table className="min-w-[1120px] divide-y divide-slate-line/70 text-left text-xs">
              <thead className="bg-navy-900 text-muted">
                <tr>
                  <th className="px-3 py-3">券種・組合せ</th>
                  <th className="px-3 py-3">観測時点のオッズ</th>
                  <th className="px-3 py-3">推定確率</th>
                  <th className="px-3 py-3">損益分岐</th>
                  <th className="px-3 py-3">期待回収率</th>
                  <th className="px-3 py-3">期待利益/100円</th>
                  <th className="px-3 py-3">確率の出所</th>
                  <th className="px-3 py-3">確信度・不確実性</th>
                  <th className="px-3 py-3">オッズ観測日時</th>
                  <th className="px-3 py-3">判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line/60 bg-slate-card/80">
                {entries.map((entry) => {
                  const metrics =
                    entry.evaluation.status === 'calculated'
                      ? entry.evaluation.metrics
                      : null
                  return (
                    <tr key={entry.candidate.id}>
                      <td className="px-3 py-3 font-semibold text-white">
                        {betTypeLabels[entry.candidate.bet_type]}{' '}
                        {selection(entry)}
                      </td>
                      <td className="px-3 py-3">{odds(entry.candidate.odds)}</td>
                      <td className="px-3 py-3">
                        {probability(entry.candidate.hit_probability)}
                      </td>
                      <td className="px-3 py-3">
                        {metrics ? percent(metrics.breakEvenProbability) : '未算出'}
                      </td>
                      <td className="px-3 py-3 font-bold text-white">
                        {metrics
                          ? `${metrics.expectedReturnRatePercent.toFixed(1)}%`
                          : '未算出'}
                      </td>
                      <td className="px-3 py-3">
                        {metrics ? yen(metrics.expectedNetProfitYen) : '未算出'}
                      </td>
                      <td className="px-3 py-3">
                        {probabilitySourceLabels[entry.candidate.probability_source]}
                      </td>
                      <td className="px-3 py-3">
                        {entry.candidate.confidence}
                        {isHighlyUncertain(entry) ? '・高い不確実性' : ''}
                      </td>
                      <td className="px-3 py-3">
                        {entry.candidate.odds_observed_at ?? '未確認'}
                      </td>
                      <td className="max-w-56 px-3 py-3 text-muted">
                        {calculationStatus(entry)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <StatusNotice>
        <span className="inline-flex items-start gap-2">
          <CircleHelp className="mt-0.5 shrink-0" size={17} />
          <span>
            展開シナリオ別の馬券的中確率は現行JSONに存在しないため未算出です。各馬評価から確率を自動生成していません。
          </span>
        </span>
      </StatusNotice>
    </section>
  )
}

export default ExpectedValueAnalysis
