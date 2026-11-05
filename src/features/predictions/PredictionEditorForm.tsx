import type {
  BetCandidate,
  HorseAssessment,
  PredictionDocument,
  Scenario,
} from '../../domain/types/import'

interface PredictionEditorFormProps {
  disabled?: boolean
  onChange: (document: PredictionDocument) => void
  value: PredictionDocument
}
function nullableNumber(value: string) {
  return value.trim() === '' ? null : Number(value)
}

function numberList(value: string) {
  return value
    .split(/[-,\s]+/)
    .filter(Boolean)
    .map(Number)
}

function projectedOrder(value: string): Scenario['projected_order'] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [horseNumber, positionGroup = 'unknown'] = entry.split(':')
      return {
        horse_number: Number(horseNumber),
        position_group: positionGroup.trim() as Scenario['projected_order'][number]['position_group'],
      }
    })
}

export function PredictionEditorForm({
  disabled = false,
  onChange,
  value,
}: PredictionEditorFormProps) {
  const updateScenario = (index: number, next: Scenario) => {
    const scenarios = [...value.scenarios]
    scenarios[index] = next
    onChange({ ...value, scenarios })
  }

  const updateHorse = (index: number, next: HorseAssessment) => {
    const horses = [...value.horses]
    horses[index] = next
    onChange({ ...value, horses })
  }

  const updateCandidate = (index: number, next: BetCandidate) => {
    const betCandidates = [...value.bet_candidates]
    betCandidates[index] = next
    onChange({ ...value, bet_candidates: betCandidates })
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="eyebrow">Scenarios</p><h2 className="mt-1 text-xl font-bold text-white">展開シナリオ</h2></div>
          <span className="text-xs text-muted">確率合計は100%にしてください</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {value.scenarios.map((scenario, index) => (
            <fieldset className="card-surface grid gap-4 p-4 sm:grid-cols-2" disabled={disabled} key={scenario.id}>
              <legend className="sr-only">{scenario.label}</legend>
              <label className="field-label">表示名<input className="field-input" onChange={(event) => updateScenario(index, { ...scenario, label: event.target.value })} value={scenario.label} /></label>
              <label className="field-label">発生確率（0〜1）<input className="field-input" max={1} min={0} onChange={(event) => updateScenario(index, { ...scenario, probability: Number(event.target.value) })} step="0.01" type="number" value={scenario.probability} /></label>
              <label className="field-label">ペース<select className="field-input" onChange={(event) => updateScenario(index, { ...scenario, pace: event.target.value as Scenario['pace'] })} value={scenario.pace}><option value="slow">slow</option><option value="middle">middle</option><option value="high">high</option><option value="unknown">unknown</option><option value="other">other</option></select></label>
              <label className="field-label">確信度<select className="field-input" onChange={(event) => updateScenario(index, { ...scenario, confidence: event.target.value as Scenario['confidence'] })} value={scenario.confidence}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option><option value="unknown">unknown</option></select></label>
              <label className="field-label sm:col-span-2">根拠<textarea className="field-input min-h-24" onChange={(event) => updateScenario(index, { ...scenario, reason: event.target.value })} value={scenario.reason} /></label>
              <label className="field-label sm:col-span-2">想定隊列（馬番:位置、カンマ区切り）<input className="field-input" onChange={(event) => updateScenario(index, { ...scenario, projected_order: projectedOrder(event.target.value) })} placeholder="2:front, 7:stalker" value={scenario.projected_order.map((entry) => `${entry.horse_number}:${entry.position_group}`).join(', ')} /></label>
              <label className="field-label sm:col-span-2">有利な脚質（カンマ区切り）<input className="field-input" onChange={(event) => updateScenario(index, { ...scenario, favored_styles: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) as Scenario['favored_styles'] })} placeholder="front, stalker" value={scenario.favored_styles.join(', ')} /></label>
            </fieldset>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="eyebrow">Horses</p><h2 className="mt-1 text-xl font-bold text-white">各馬評価</h2></div>
          <span className="text-xs text-muted">未設定の確率は空欄のまま保存</span>
        </div>
        <div className="space-y-4">
          {value.horses.map((horse, index) => (
            <fieldset className="card-surface p-4" disabled={disabled} key={horse.horse_number}>
              <legend className="sr-only">{horse.name}</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-bold text-teal-accent">{horse.frame_number}枠 {horse.horse_number}番</p><h3 className="mt-1 font-bold text-white">{horse.name}</h3></div>
                <label className="field-label min-w-36">確信度<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, confidence: event.target.value as HorseAssessment['confidence'] })} value={horse.confidence}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option><option value="unknown">unknown</option></select></label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="field-label">脚質<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, running_style: event.target.value as HorseAssessment['running_style'] })} value={horse.running_style}><option value="front">front</option><option value="stalker">stalker</option><option value="midfield">midfield</option><option value="closer">closer</option><option value="unknown">unknown</option></select></label>
                <label className="field-label">状態<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, form: event.target.value as HorseAssessment['form'] })} value={horse.form}><option value="excellent">excellent</option><option value="good">good</option><option value="average">average</option><option value="poor">poor</option><option value="unknown">unknown</option></select></label>
                <label className="field-label">馬場適性<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, track_suitability: event.target.value as HorseAssessment['track_suitability'] })} value={horse.track_suitability}><option value="strong">strong</option><option value="suitable">suitable</option><option value="neutral">neutral</option><option value="unsuitable">unsuitable</option><option value="unknown">unknown</option></select></label>
                <label className="field-label">距離適性<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, distance_suitability: event.target.value as HorseAssessment['distance_suitability'] })} value={horse.distance_suitability}><option value="strong">strong</option><option value="suitable">suitable</option><option value="neutral">neutral</option><option value="unsuitable">unsuitable</option><option value="unknown">unknown</option></select></label>
                <label className="field-label">勝率<input className="field-input" max={1} min={0} onChange={(event) => updateHorse(index, { ...horse, probabilities: { ...horse.probabilities, win: nullableNumber(event.target.value) } })} placeholder="未設定" step="0.01" type="number" value={horse.probabilities.win ?? ''} /></label>
                <label className="field-label">連対率<input className="field-input" max={1} min={0} onChange={(event) => updateHorse(index, { ...horse, probabilities: { ...horse.probabilities, top2: nullableNumber(event.target.value) } })} placeholder="未設定" step="0.01" type="number" value={horse.probabilities.top2 ?? ''} /></label>
                <label className="field-label">複勝率<input className="field-input" max={1} min={0} onChange={(event) => updateHorse(index, { ...horse, probabilities: { ...horse.probabilities, top3: nullableNumber(event.target.value) } })} placeholder="未設定" step="0.01" type="number" value={horse.probabilities.top3 ?? ''} /></label>
                <label className="field-label sm:col-span-2">過去実績<textarea className="field-input min-h-24" onChange={(event) => updateHorse(index, { ...horse, past_performance: event.target.value })} value={horse.past_performance} /></label>
                <label className="field-label sm:col-span-2">評価根拠<textarea className="field-input min-h-24" onChange={(event) => updateHorse(index, { ...horse, rationale: event.target.value })} value={horse.rationale} /></label>
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="text-xs font-semibold text-muted">展開別評価</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {value.scenarios.map((scenario) => (
                      <label className="field-label" key={scenario.id}>{scenario.label}<select className="field-input" onChange={(event) => updateHorse(index, { ...horse, scenario_assessments: { ...horse.scenario_assessments, [scenario.id]: event.target.value as HorseAssessment['scenario_assessments'][string] } })} value={horse.scenario_assessments[scenario.id] ?? 'unknown'}><option value="advantage">advantage</option><option value="neutral">neutral</option><option value="disadvantage">disadvantage</option><option value="unknown">unknown</option></select></label>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="eyebrow">Bet candidates</p><h2 className="mt-1 text-xl font-bold text-white">馬券候補</h2></div>
          <span className="text-xs text-muted">不明な確率・オッズは空欄</span>
        </div>
        {value.bet_candidates.length === 0 ? <p className="card-surface p-5 text-sm text-muted">候補なし（見送り）</p> : null}
        <div className="space-y-4">
          {value.bet_candidates.map((candidate, index) => (
            <fieldset className="card-surface grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4" disabled={disabled} key={candidate.id}>
              <legend className="sr-only">{candidate.id}</legend>
              <label className="field-label">券種<select className="field-input" onChange={(event) => updateCandidate(index, { ...candidate, bet_type: event.target.value as BetCandidate['bet_type'] })} value={candidate.bet_type}><option value="win">単勝</option><option value="place">複勝</option><option value="bracket_quinella">枠連</option><option value="quinella">馬連</option><option value="wide">ワイド</option><option value="exacta">馬単</option><option value="trio">三連複</option><option value="trifecta">三連単</option></select></label>
              <label className="field-label">番号組<input className="field-input" onChange={(event) => updateCandidate(index, { ...candidate, horse_numbers: numberList(event.target.value) })} value={candidate.horse_numbers.join('-')} /></label>
              <label className="field-label">オッズ<input className="field-input" min={1} onChange={(event) => updateCandidate(index, { ...candidate, odds: nullableNumber(event.target.value) })} placeholder="未設定" step="0.1" type="number" value={candidate.odds ?? ''} /></label>
              <label className="field-label">推定的中確率<input className="field-input" max={1} min={0} onChange={(event) => updateCandidate(index, { ...candidate, hit_probability: nullableNumber(event.target.value) })} placeholder="未設定" step="0.01" type="number" value={candidate.hit_probability ?? ''} /></label>
              <label className="field-label">確率の出所<select className="field-input" onChange={(event) => updateCandidate(index, { ...candidate, probability_source: event.target.value as BetCandidate['probability_source'] })} value={candidate.probability_source}><option value="ai_estimate">AI推定</option><option value="user_estimate">ユーザー推定</option><option value="model_estimate">モデル推定</option><option value="unset">未設定</option></select></label>
              <label className="field-label">オッズ観測日時<input className="field-input" onChange={(event) => updateCandidate(index, { ...candidate, odds_observed_at: event.target.value || null })} placeholder="2026-11-08T12:00:00+09:00" value={candidate.odds_observed_at ?? ''} /></label>
              <label className="field-label">確信度<select className="field-input" onChange={(event) => updateCandidate(index, { ...candidate, confidence: event.target.value as BetCandidate['confidence'] })} value={candidate.confidence}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option><option value="unknown">unknown</option></select></label>
              <label className="field-label lg:col-span-4">根拠<textarea className="field-input min-h-20" onChange={(event) => updateCandidate(index, { ...candidate, rationale: event.target.value })} value={candidate.rationale} /></label>
            </fieldset>
          ))}
        </div>
      </section>
    </div>
  )
}
