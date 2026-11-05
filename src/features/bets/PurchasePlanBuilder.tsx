import {
  AlertTriangle,
  Calculator,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatusNotice } from '../../components/StatusNotice'
import {
  buildPurchasePlanWriteData,
  generatePurchasePlans,
  recalculatePlanAllocations,
  validatePurchasePlanSettings,
  type ManualAllocationInput,
  type PurchasePlanWriteData,
} from '../../domain/calculations/purchase-plan'
import {
  betTypeLabels,
  evaluateBetCandidate,
} from '../../domain/calculations/expected-value'
import type { BetType, PredictionDocument } from '../../domain/types/import'
import type {
  GeneratedPurchasePlan,
  PurchasePlanSettings,
  PurchasePlanStrategy,
} from '../../domain/types/purchase-plan'

const allBetTypes = Object.keys(betTypeLabels) as BetType[]

const defaultPlanSettings: PurchasePlanSettings = {
  betTypeMode: 'auto',
  budgetYen: 1_000,
  kellyFraction: 0.25,
  lossControlBudgetFraction: 0.3,
  maxSelections: 5,
  maxStakePerBetYen: 500,
  selectedBetTypes: allBetTypes,
}

const strategyDescriptions: Record<PurchasePlanStrategy, string> = {
  expected_value: '期待回収率上位を選び、1点集中を避けて100円ずつ巡回配分',
  fractional_kelly: '単一馬券のケリー比率を縮小した参考額。相関は最適化しない',
  loss_control: '予算使用率・確信度・選択番号の重なりを保守的に制限',
}

const confidenceLabels = {
  high: '高',
  medium: '中',
  low: '低',
  unknown: '不明',
} as const

function yen(value: number) {
  return `${Math.round(value).toLocaleString('ja-JP')}円`
}

function percent(value: number | null) {
  return value === null ? '未算出' : `${value.toFixed(1)}%`
}

function probability(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function createPlanId() {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `plan-${randomPart}`
}

function strategyPlan(
  plans: GeneratedPurchasePlan[],
  strategy: PurchasePlanStrategy,
) {
  return plans.find((plan) => plan.strategy === strategy) ?? null
}

interface PurchasePlanBuilderProps {
  onSave: (data: PurchasePlanWriteData) => Promise<void>
  prediction: PredictionDocument
  raceName: string
  sourcePredictionVersionId: string
  userId: string
  versionNumber: number
}

export function PurchasePlanBuilder({
  onSave,
  prediction,
  raceName,
  sourcePredictionVersionId,
  userId,
  versionNumber,
}: PurchasePlanBuilderProps) {
  const [budgetYen, setBudgetYen] = useState(defaultPlanSettings.budgetYen)
  const [maxSelections, setMaxSelections] = useState(
    defaultPlanSettings.maxSelections,
  )
  const [maxStakePerBetYen, setMaxStakePerBetYen] = useState(
    defaultPlanSettings.maxStakePerBetYen,
  )
  const [kellyFraction, setKellyFraction] = useState(
    defaultPlanSettings.kellyFraction,
  )
  const [lossControlBudgetFraction, setLossControlBudgetFraction] = useState(
    defaultPlanSettings.lossControlBudgetFraction,
  )
  const [betTypeMode, setBetTypeMode] = useState<'auto' | 'manual'>(
    defaultPlanSettings.betTypeMode,
  )
  const [selectedBetTypes, setSelectedBetTypes] = useState<BetType[]>(
    defaultPlanSettings.selectedBetTypes,
  )
  const [selectedStrategy, setSelectedStrategy] =
    useState<PurchasePlanStrategy>('expected_value')
  const [allocationInputs, setAllocationInputs] = useState<ManualAllocationInput[]>(
    () =>
      generatePurchasePlans(
        prediction.bet_candidates,
        defaultPlanSettings,
      )[0]!.allocations.map(({ candidateId, stakeYen }) => ({
        candidateId,
        stakeYen,
      })),
  )
  const [planName, setPlanName] = useState('推定期待利益重視')
  const [memo, setMemo] = useState('')
  const [candidateToAdd, setCandidateToAdd] = useState('')
  const [planId, setPlanId] = useState(createPlanId)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const settings = useMemo<PurchasePlanSettings>(
    () => ({
      betTypeMode,
      budgetYen,
      kellyFraction,
      lossControlBudgetFraction,
      maxSelections,
      maxStakePerBetYen,
      selectedBetTypes,
    }),
    [
      betTypeMode,
      budgetYen,
      kellyFraction,
      lossControlBudgetFraction,
      maxSelections,
      maxStakePerBetYen,
      selectedBetTypes,
    ],
  )
  const settingsIssues = useMemo(
    () => validatePurchasePlanSettings(settings),
    [settings],
  )
  const generatedPlans = useMemo(
    () =>
      settingsIssues.length === 0
        ? generatePurchasePlans(prediction.bet_candidates, settings)
        : [],
    [prediction.bet_candidates, settings, settingsIssues.length],
  )
  const selectedGeneratedPlan = strategyPlan(generatedPlans, selectedStrategy)

  function selectPlanForEditing(plan: GeneratedPurchasePlan) {
    setSelectedStrategy(plan.strategy)
    setAllocationInputs(
      plan.allocations.map(({ candidateId, stakeYen }) => ({
        candidateId,
        stakeYen,
      })),
    )
    setPlanName(plan.name)
    setMemo('')
    setCandidateToAdd('')
    setPlanId(createPlanId())
    setSaveState('idle')
    setSaveMessage('')
  }

  const recalculated = useMemo(
    () =>
      recalculatePlanAllocations({
        allocations: allocationInputs,
        candidates: prediction.bet_candidates,
        settings,
      }),
    [allocationInputs, prediction.bet_candidates, settings],
  )
  const candidateById = useMemo(
    () => new Map(prediction.bet_candidates.map((candidate) => [candidate.id, candidate])),
    [prediction.bet_candidates],
  )
  const allocatedIds = useMemo(
    () => new Set(allocationInputs.map((allocation) => allocation.candidateId)),
    [allocationInputs],
  )
  const addableCandidates = prediction.bet_candidates.filter(
    (candidate) =>
      !allocatedIds.has(candidate.id) &&
      evaluateBetCandidate(candidate).status === 'calculated',
  )

  const editablePlan = useMemo<GeneratedPurchasePlan | null>(() => {
    if (!selectedGeneratedPlan) {
      return null
    }
    return {
      ...selectedGeneratedPlan,
      allocations: recalculated.allocations,
      candidateSnapshot: recalculated.candidateSnapshot,
      summary: recalculated.summary,
      warnings: [
        ...new Set([
          ...selectedGeneratedPlan.warnings,
          ...recalculated.warnings,
        ]),
      ],
    }
  }, [recalculated, selectedGeneratedPlan])

  function toggleBetType(betType: BetType) {
    setSelectedBetTypes((current) =>
      current.includes(betType)
        ? current.filter((entry) => entry !== betType)
        : [...current, betType],
    )
  }

  function updateStake(candidateId: string, stakeYen: number) {
    setAllocationInputs((current) =>
      current.map((allocation) =>
        allocation.candidateId === candidateId
          ? { ...allocation, stakeYen }
          : allocation,
      ),
    )
    setSaveState('idle')
  }

  function removeAllocation(candidateId: string) {
    setAllocationInputs((current) =>
      current.filter((allocation) => allocation.candidateId !== candidateId),
    )
    setSaveState('idle')
  }

  function addAllocation() {
    if (!candidateToAdd || allocatedIds.has(candidateToAdd)) {
      return
    }
    setAllocationInputs((current) => [
      ...current,
      { candidateId: candidateToAdd, stakeYen: 100 },
    ])
    setCandidateToAdd('')
    setSaveState('idle')
  }

  async function savePlan() {
    if (!editablePlan || recalculated.errors.length > 0) {
      return
    }
    setSaveState('saving')
    setSaveMessage('')
    try {
      const data = buildPurchasePlanWriteData({
        authorUid: userId,
        memo,
        name: planName,
        plan: editablePlan,
        planId,
        sourcePredictionVersionId,
      })
      await onSave(data)
      setPlanId(createPlanId())
      setSaveState('saved')
      setSaveMessage('不変スナップショットとして保存しました。')
    } catch (error) {
      setSaveState('error')
      setSaveMessage(
        error instanceof Error ? error.message : '購入プランを保存できませんでした。',
      )
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-surface p-5 sm:p-6">
        <p className="eyebrow">Plan source</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {raceName} 購入プラン
            </h1>
            <p className="mt-2 text-sm text-muted">
              元予想: v{versionNumber} / {sourcePredictionVersionId}
            </p>
          </div>
          <span className="rounded-full border border-teal-accent/40 px-3 py-1.5 text-xs font-bold text-teal-accent">
            提案のみ・実購入ではありません
          </span>
        </div>
      </section>

      <StatusNotice tone="warning">
        <span className="inline-flex items-start gap-2">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          <span>
            推定確率の誤差、オッズ変動、買い目間の相関があります。数学的な最適解や利益保証ではなく、実際の購入操作も行いません。
          </span>
        </span>
      </StatusNotice>

      <section className="card-surface p-5 sm:p-6">
        <div>
          <p className="eyebrow">Constraints</p>
          <h2 className="mt-1 text-xl font-bold text-white">予算と配分条件</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[500, 1_000, 2_000, 3_000].map((preset) => (
            <button
              className="button-secondary"
              key={preset}
              onClick={() => setBudgetYen(preset)}
              type="button"
            >
              {preset.toLocaleString()}円
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field-label">
            予算（円）
            <input
              className="field-input"
              min={0}
              onChange={(event) => setBudgetYen(Number(event.target.value))}
              step={100}
              type="number"
              value={budgetYen}
            />
          </label>
          <label className="field-label">
            購入点数上限
            <input
              className="field-input"
              max={50}
              min={1}
              onChange={(event) => setMaxSelections(Number(event.target.value))}
              type="number"
              value={maxSelections}
            />
          </label>
          <label className="field-label">
            1点上限（円）
            <input
              className="field-input"
              min={100}
              onChange={(event) => setMaxStakePerBetYen(Number(event.target.value))}
              step={100}
              type="number"
              value={maxStakePerBetYen}
            />
          </label>
          <label className="field-label">
            ケリー縮小係数
            <select
              className="field-input"
              onChange={(event) => setKellyFraction(Number(event.target.value))}
              value={kellyFraction}
            >
              <option value={0.125}>1/8 Kelly</option>
              <option value={0.25}>1/4 Kelly</option>
              <option value={0.5}>1/2 Kelly</option>
            </select>
          </label>
          <label className="field-label">
            損失抑制の予算使用率
            <select
              className="field-input"
              onChange={(event) =>
                setLossControlBudgetFraction(Number(event.target.value))
              }
              value={lossControlBudgetFraction}
            >
              <option value={0.2}>20%</option>
              <option value={0.3}>30%</option>
              <option value={0.5}>50%</option>
            </select>
          </label>
          <label className="field-label">
            券種選択
            <select
              className="field-input"
              onChange={(event) =>
                setBetTypeMode(event.target.value as 'auto' | 'manual')
              }
              value={betTypeMode}
            >
              <option value="auto">自動</option>
              <option value="manual">手動指定</option>
            </select>
          </label>
        </div>
        {betTypeMode === 'manual' ? (
          <fieldset className="mt-4">
            <legend className="field-label">使用する券種</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {allBetTypes.map((betType) => (
                <label
                  className="inline-flex items-center gap-2 rounded-full border border-slate-line px-3 py-2 text-xs text-copy"
                  key={betType}
                >
                  <input
                    checked={selectedBetTypes.includes(betType)}
                    onChange={() => toggleBetType(betType)}
                    type="checkbox"
                  />
                  {betTypeLabels[betType]}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {settingsIssues.length > 0 ? (
          <div className="mt-4 space-y-2">
            {settingsIssues.map((issue) => (
              <StatusNotice key={issue} tone="error">
                {issue}
              </StatusNotice>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <div>
          <p className="eyebrow">Compare</p>
          <h2 className="mt-1 text-xl font-bold text-white">3プラン比較</h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {generatedPlans.map((plan) => (
            <article
              className={`card-surface p-5 ${
                selectedStrategy === plan.strategy
                  ? 'border-teal-accent/70'
                  : ''
              }`}
              key={plan.strategy}
            >
              <p className="text-sm font-bold text-teal-accent">{plan.name}</p>
              <p className="mt-2 min-h-10 text-xs leading-5 text-muted">
                {strategyDescriptions[plan.strategy]}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-navy-900 p-3">
                  <dt className="text-muted">使用 / 未使用</dt>
                  <dd className="mt-1 font-bold text-white">
                    {yen(plan.summary.totalStakeYen)} /{' '}
                    {yen(plan.summary.unusedBudgetYen)}
                  </dd>
                </div>
                <div className="rounded-lg bg-navy-900 p-3">
                  <dt className="text-muted">購入点数</dt>
                  <dd className="mt-1 font-bold text-white">
                    {plan.allocations.length}点
                  </dd>
                </div>
                <div className="rounded-lg bg-navy-900 p-3">
                  <dt className="text-muted">期待利益合計</dt>
                  <dd className="mt-1 font-bold text-white">
                    {yen(plan.summary.expectedNetProfitYen)}
                  </dd>
                </div>
                <div className="rounded-lg bg-navy-900 p-3">
                  <dt className="text-muted">推定期待回収率</dt>
                  <dd className="mt-1 font-bold text-white">
                    {percent(plan.summary.expectedReturnRatePercent)}
                  </dd>
                </div>
              </dl>
              <button
                className="button-secondary mt-4 w-full"
                onClick={() => selectPlanForEditing(plan)}
                type="button"
              >
                この方式を編集
              </button>
            </article>
          ))}
        </div>
      </section>

      {editablePlan ? (
        <section className="space-y-4">
          <div>
            <p className="eyebrow">Manual adjustment</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
              <WalletCards className="text-teal-accent" size={21} />
              {editablePlan.name}を調整
            </h2>
          </div>

          <div className="card-surface grid gap-4 p-5 sm:grid-cols-2">
            <label className="field-label">
              プラン名
              <input
                className="field-input"
                maxLength={120}
                onChange={(event) => {
                  setPlanName(event.target.value)
                  setSaveState('idle')
                }}
                value={planName}
              />
            </label>
            <label className="field-label sm:col-span-2">
              メモ
              <textarea
                className="field-input min-h-24"
                maxLength={2_000}
                onChange={(event) => {
                  setMemo(event.target.value)
                  setSaveState('idle')
                }}
                value={memo}
              />
            </label>
          </div>

          <div className="grid gap-3 md:hidden">
            {allocationInputs.map((allocation) => {
              const candidate = candidateById.get(allocation.candidateId)
              const calculated = recalculated.allocations.find(
                (entry) => entry.candidateId === allocation.candidateId,
              )
              if (!candidate) return null
              return (
                <article className="card-surface p-4" key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-teal-accent">
                        {betTypeLabels[candidate.bet_type]}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-white">
                        {candidate.horse_numbers.join('-')}
                      </h3>
                    </div>
                    <button
                      aria-label={`${candidate.id}を除外`}
                      className="button-secondary"
                      onClick={() => removeAllocation(candidate.id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label className="field-label mt-4">
                    購入金額（100円単位）
                    <input
                      className="field-input"
                      min={0}
                      onChange={(event) =>
                        updateStake(candidate.id, Number(event.target.value))
                      }
                      step={100}
                      type="number"
                      value={allocation.stakeYen}
                    />
                  </label>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted">観測オッズ / 確率</dt>
                      <dd className="text-copy">
                        {candidate.odds?.toFixed(1)}倍 /{' '}
                        {candidate.hit_probability === null
                          ? '未設定'
                          : probability(candidate.hit_probability)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">期待利益</dt>
                      <dd className="text-copy">
                        {calculated ? yen(calculated.expectedNetProfitYen) : '未算出'}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 break-all text-xs text-muted">
                    オッズ観測日時: {candidate.odds_observed_at ?? '日時なし'}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    根拠: {candidate.rationale}
                  </p>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-line/80 md:block">
            <table className="min-w-[1120px] divide-y divide-slate-line/70 text-left text-xs">
              <thead className="bg-navy-900 text-muted">
                <tr>
                  <th className="px-3 py-3">券種・組合せ</th>
                  <th className="px-3 py-3">購入額</th>
                  <th className="px-3 py-3">推定確率</th>
                  <th className="px-3 py-3">観測時点オッズ</th>
                  <th className="px-3 py-3">期待回収率</th>
                  <th className="px-3 py-3">期待純利益</th>
                  <th className="px-3 py-3">確信度</th>
                  <th className="px-3 py-3">評価根拠</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line/60 bg-slate-card/80">
                {allocationInputs.map((allocation) => {
                  const candidate = candidateById.get(allocation.candidateId)
                  const calculated = recalculated.allocations.find(
                    (entry) => entry.candidateId === allocation.candidateId,
                  )
                  if (!candidate) return null
                  return (
                    <tr key={candidate.id}>
                      <td className="px-3 py-3 font-bold text-white">
                        {betTypeLabels[candidate.bet_type]}{' '}
                        {candidate.horse_numbers.join('-')}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          aria-label={`${candidate.id}の購入金額`}
                          className="field-input w-28"
                          min={0}
                          onChange={(event) =>
                            updateStake(candidate.id, Number(event.target.value))
                          }
                          step={100}
                          type="number"
                          value={allocation.stakeYen}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {candidate.hit_probability === null
                          ? '未設定'
                          : probability(candidate.hit_probability)}
                      </td>
                      <td className="px-3 py-3">
                        {candidate.odds?.toFixed(1) ?? '未設定'}倍
                        <br />
                        <span className="text-muted">
                          {candidate.odds_observed_at ?? '日時なし'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {calculated
                          ? `${calculated.expectedReturnRatePercent.toFixed(1)}%`
                          : '未算出'}
                      </td>
                      <td className="px-3 py-3">
                        {calculated
                          ? yen(calculated.expectedNetProfitYen)
                          : '未算出'}
                      </td>
                      <td className="px-3 py-3">
                        {confidenceLabels[candidate.confidence]}
                      </td>
                      <td className="max-w-64 px-3 py-3 text-muted">
                        {candidate.rationale}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          aria-label={`${candidate.id}を除外`}
                          className="button-secondary"
                          onClick={() => removeAllocation(candidate.id)}
                          type="button"
                        >
                          <Trash2 size={15} /> 除外
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="card-surface flex flex-wrap items-end gap-3 p-4">
            <label className="field-label min-w-64 flex-1">
              購入点を追加
              <select
                className="field-input"
                onChange={(event) => setCandidateToAdd(event.target.value)}
                value={candidateToAdd}
              >
                <option value="">候補を選択</option>
                {addableCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {betTypeLabels[candidate.bet_type]}{' '}
                    {candidate.horse_numbers.join('-')}（{candidate.id}）
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button-secondary"
              disabled={!candidateToAdd}
              onClick={addAllocation}
              type="button"
            >
              <Plus size={16} /> 追加
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['合計使用額', yen(recalculated.summary.totalStakeYen)],
              ['未使用予算', yen(recalculated.summary.unusedBudgetYen)],
              ['期待利益合計', yen(recalculated.summary.expectedNetProfitYen)],
              [
                '推定期待回収率',
                percent(recalculated.summary.expectedReturnRatePercent),
              ],
              ['全不的中時の損失額', yen(recalculated.summary.worstCaseLossYen)],
            ].map(([label, value]) => (
              <div className="card-surface p-4" key={label}>
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 font-bold text-white">{value}</p>
              </div>
            ))}
          </div>

          {recalculated.errors.length > 0 ? (
            <div className="space-y-2">
              {recalculated.errors.map((error) => (
                <StatusNotice key={error} tone="error">
                  {error}
                </StatusNotice>
              ))}
            </div>
          ) : null}
          {editablePlan.warnings.map((warning) => (
            <StatusNotice key={warning} tone="warning">
              {warning}
            </StatusNotice>
          ))}
          <StatusNotice>
            期待利益合計は各馬券の期待利益を線形に足した値です。正確なプラン的中確率、全損確率、分散は共同確率がないため未算出です。
          </StatusNotice>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="button-primary"
              disabled={
                saveState === 'saving' ||
                saveState === 'saved' ||
                recalculated.errors.length > 0 ||
                !planName.trim()
              }
              onClick={savePlan}
              type="button"
            >
              <Save size={17} />
              {saveState === 'saving' ? '保存中…' : '新しいプランとして保存'}
            </button>
            <p className="text-xs text-muted">
              保存後は変更不可。再調整時は別プランとして保存します。
            </p>
          </div>
          {saveMessage ? (
            <StatusNotice tone={saveState === 'error' ? 'error' : 'success'}>
              {saveMessage}
            </StatusNotice>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="eyebrow">Race scenarios</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
            <Calculator className="text-teal-accent" size={21} />
            展開シナリオと定性評価
          </h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {prediction.scenarios.map((scenario) => (
            <article className="card-surface p-4" key={scenario.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-teal-accent">
                    {scenario.pace}
                  </p>
                  <h3 className="mt-1 font-bold text-white">{scenario.label}</h3>
                </div>
                <span className="rounded-full bg-navy-900 px-2.5 py-1 text-xs text-copy">
                  {probability(scenario.probability)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{scenario.reason}</p>
              <p className="mt-2 text-xs text-muted">
                確信度: {confidenceLabels[scenario.confidence]}
              </p>
            </article>
          ))}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-line/80">
          <table className="min-w-[720px] divide-y divide-slate-line/70 text-left text-xs">
            <thead className="bg-navy-900 text-muted">
              <tr>
                <th className="px-3 py-3">馬番・馬名</th>
                {prediction.scenarios.map((scenario) => (
                  <th className="px-3 py-3" key={scenario.id}>
                    {scenario.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-line/60 bg-slate-card/80">
              {prediction.horses.map((horse) => (
                <tr key={horse.horse_number}>
                  <td className="px-3 py-3 font-bold text-white">
                    {horse.horse_number} {horse.name}
                  </td>
                  {prediction.scenarios.map((scenario) => (
                    <td className="px-3 py-3 text-copy" key={scenario.id}>
                      {horse.scenario_assessments[scenario.id] ?? '未設定'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <StatusNotice tone="warning">
          <span className="inline-flex items-start gap-2">
            <ShieldAlert className="mt-0.5 shrink-0" size={17} />
            <span>
              現行JSONには馬券ごとの展開別条件付き的中確率がありません。各馬の定性評価から確率や展開別損失額を生成していません。
            </span>
          </span>
        </StatusNotice>
      </section>
    </div>
  )
}
