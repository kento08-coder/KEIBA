import { useEffect, useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import type { PurchaseRecord, ResultRecord } from '../../domain/types/firestore'
import {
  subscribePurchases,
  subscribeResults,
} from '../../infrastructure/repositories/settlement-repository'

type State<T> = {
  error: string | null
  key: string | null
  state: 'idle' | 'loading' | 'ready' | 'error'
  value: T
}

function message(error: unknown) {
  return error instanceof Error ? error.message : '同期中にエラーが発生しました。'
}

export function usePurchases(userId: string | null, raceId?: string) {
  const [result, setResult] = useState<State<Array<PurchaseRecord<Timestamp | null>>>>({
    error: null,
    key: null,
    state: 'idle',
    value: [],
  })
  useEffect(() => {
    if (!userId || !raceId) return undefined
    const key = `${userId}/${raceId}`
    return subscribePurchases(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) => setResult({ error: message(error), key, state: 'error', value: [] }),
    )
  }, [raceId, userId])
  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) return { error: null, state: 'idle' as const, value: [] }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: [] }
}

export function useResults(userId: string | null, raceId?: string) {
  const [result, setResult] = useState<State<Array<ResultRecord<Timestamp | null>>>>({
    error: null,
    key: null,
    state: 'idle',
    value: [],
  })
  useEffect(() => {
    if (!userId || !raceId) return undefined
    const key = `${userId}/${raceId}`
    return subscribeResults(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) => setResult({ error: message(error), key, state: 'error', value: [] }),
    )
  }, [raceId, userId])
  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) return { error: null, state: 'idle' as const, value: [] }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: [] }
}
