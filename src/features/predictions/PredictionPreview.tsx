import type { PredictionDocument } from '../../domain/types/import'

const betLabels: Record<string, string> = {
  win: '単勝',
  place: '複勝',
  bracket_quinella: '枠連',
  quinella: '馬連',
  wide: 'ワイド',
  exacta: '馬単',
  trio: '三連複',
  trifecta: '三連単',
}
function probability(value: number | null) {
  return value === null ? '未設定' : `${(value * 100).toFixed(1)}%`
}

export function PredictionPreview({ document }: { document: PredictionDocument }) {
  return (
    <div className="space-y-5">
      <section className="card-surface p-5">
        <p className="eyebrow">Race</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">{document.race.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {document.race.date}・{document.race.venue_code} {document.race.race_number}R・
              {document.race.distance_m.toLocaleString()}m
            </p>
          </div>
          <p className="text-xs text-muted">生成元: {document.source_agent}</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">展開シナリオ</h2>
          <span className="text-xs text-muted">{document.scenarios.length}件</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {document.scenarios.map((scenario) => (
            <article className="card-surface p-4" key={scenario.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{scenario.label}</p>
                  <p className="mt-1 text-xs text-muted">ペース: {scenario.pace}</p>
                </div>
                <span className="rounded-full bg-teal-accent/10 px-2.5 py-1 text-xs font-bold text-teal-accent">
                  {(scenario.probability * 100).toFixed(1)}%
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{scenario.reason}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">各馬評価</h2>
          <span className="text-xs text-muted">{document.horses.length}頭</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {document.horses.map((horse) => (
            <article className="card-surface p-4" key={horse.horse_number}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-teal-accent">
                    {horse.frame_number}枠 {horse.horse_number}番
                  </p>
                  <h3 className="mt-1 font-bold text-white">{horse.name}</h3>
                </div>
                <span className="text-xs text-muted">{horse.confidence}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-navy-900 p-2">
                  <dt className="text-muted">勝率</dt>
                  <dd className="mt-1 font-bold text-white">{probability(horse.probabilities.win)}</dd>
                </div>
                <div className="rounded-lg bg-navy-900 p-2">
                  <dt className="text-muted">連対率</dt>
                  <dd className="mt-1 font-bold text-white">{probability(horse.probabilities.top2)}</dd>
                </div>
                <div className="rounded-lg bg-navy-900 p-2">
                  <dt className="text-muted">複勝率</dt>
                  <dd className="mt-1 font-bold text-white">{probability(horse.probabilities.top3)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm leading-6 text-muted">{horse.rationale}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">馬券候補</h2>
          <span className="text-xs text-muted">{document.bet_candidates.length}件</span>
        </div>
        {document.bet_candidates.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted">候補なし（見送り）</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-line/80">
            <table className="min-w-full divide-y divide-slate-line/70 text-left text-sm">
              <thead className="bg-navy-900 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3">券種</th>
                  <th className="px-4 py-3">組合せ</th>
                  <th className="px-4 py-3">推定確率</th>
                  <th className="px-4 py-3">オッズ</th>
                  <th className="px-4 py-3">確信度</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line/60 bg-slate-card/80">
                {document.bet_candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td className="px-4 py-3 font-semibold text-white">
                      {betLabels[candidate.bet_type] ?? candidate.bet_type}
                    </td>
                    <td className="px-4 py-3">{candidate.horse_numbers.join('-')}</td>
                    <td className="px-4 py-3">{probability(candidate.hit_probability)}</td>
                    <td className="px-4 py-3">
                      {candidate.odds === null ? '未設定' : `${candidate.odds.toFixed(1)}倍`}
                    </td>
                    <td className="px-4 py-3 text-muted">{candidate.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
