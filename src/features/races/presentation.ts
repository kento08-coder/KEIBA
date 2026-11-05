import type { Timestamp } from 'firebase/firestore'
import type { RaceStatus } from '../../domain/types/firestore'

export const raceStatusLabels: Record<RaceStatus, string> = {
  registered: 'レース登録済み',
  predicting: '予想編集中',
  prediction_confirmed: '予想確定済み',
  purchased: '購入記録済み',
  result_recorded: '結果登録済み',
}
export const surfaceLabels: Record<string, string> = {
  turf: '芝',
  dirt: 'ダート',
  obstacle: '障害',
  other: 'その他',
  unknown: '未確認',
}

export function formatTimestamp(value: Timestamp | null | undefined) {
  if (!value) {
    return '同期中'
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value.toDate())
}
