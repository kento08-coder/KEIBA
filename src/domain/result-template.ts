import type { ResultDocument } from './types/import'

export const RESULT_INPUT_PENDING_AGENT = 'manual-entry-pending'

export function createResultInputTemplate(raceId: string) {
  return {
    schema_version: '1.0.0',
    document_type: 'result',
    race_id: raceId,
    generated_at: new Date().toISOString(),
    source_agent: RESULT_INPUT_PENDING_AGENT,
    sources: [],
    notes:
      '入力待ちテンプレートです。公式結果を確認して全項目を入力してください。',
    result_status: 'draft',
    finishers: [],
    payouts: [],
    observed_pace: {
      label: 'unknown',
      basis: '入力待ち',
      verified: false,
      passing_orders: [],
    },
    interpretation: { race_shape: '入力待ち', confidence: 'unknown' },
  }
}

export function hasResultInputPlaceholders(
  result: Pick<ResultDocument, 'source_agent' | 'sources'>,
) {
  return (
    result.source_agent === RESULT_INPUT_PENDING_AGENT ||
    result.sources.some(
      (source) =>
        new URL(source.url).hostname.toLowerCase() === 'placeholder.invalid' ||
        source.title.includes('[入力待ち]'),
    )
  )
}
