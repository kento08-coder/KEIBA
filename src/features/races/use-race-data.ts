import { useEffect, useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import type {
  PredictionDraftRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  RaceRecord,
} from '../../domain/types/firestore'
import {
  subscribePredictionDraft,
  subscribePredictionVersion,
  subscribePredictionVersions,
  subscribePurchasePlans,
  subscribeRace,
  subscribeRaces,
} from '../../infrastructure/repositories/race-repository'

type LoadingState = 'idle' | 'loading' | 'ready' | 'error'

interface LiveValue<T> {
  error: string | null
  key: string | null
  state: LoadingState
  value: T
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同期中にエラーが発生しました。'
}

export function useRaces(userId: string | null) {
  const [result, setResult] = useState<LiveValue<Array<RaceRecord<Timestamp | null>>>>({
    error: null, key: null, state: 'idle', value: [],
  })

  useEffect(() => {
    if (!userId) {
      return undefined
    }
    return subscribeRaces(
      userId,
      (value) => setResult({ error: null, key: userId, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key: userId, state: 'error', value: [] }),
    )
  }, [userId])

  if (!userId) {
    return { error: null, state: 'idle' as const, value: [] }
  }
  return result.key === userId
    ? result
    : { error: null, state: 'loading' as const, value: [] }
}

export function useRace(userId: string | null, raceId: string | undefined) {
  const [result, setResult] = useState<LiveValue<RaceRecord<Timestamp | null> | null>>({
    error: null, key: null, state: 'idle', value: null,
  })

  useEffect(() => {
    if (!userId || !raceId) {
      return undefined
    }
    const key = `${userId}/${raceId}`
    return subscribeRace(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key, state: 'error', value: null }),
    )
  }, [raceId, userId])

  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) {
    return { error: null, state: 'idle' as const, value: null }
  }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: null }
}
export function usePredictionDraft(
  userId: string | null,
  raceId: string | undefined,
) {
  const [result, setResult] = useState<LiveValue<PredictionDraftRecord<Timestamp | null> | null>>({
    error: null, key: null, state: 'idle', value: null,
  })

  useEffect(() => {
    if (!userId || !raceId) {
      return undefined
    }
    const key = `${userId}/${raceId}`
    return subscribePredictionDraft(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key, state: 'error', value: null }),
    )
  }, [raceId, userId])

  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) {
    return { error: null, state: 'idle' as const, value: null }
  }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: null }
}
export function usePredictionVersions(
  userId: string | null,
  raceId: string | undefined,
) {
  const [result, setResult] = useState<
    LiveValue<Array<PredictionVersionRecord<Timestamp | null> & { id: string }>>
  >({ error: null, key: null, state: 'idle', value: [] })

  useEffect(() => {
    if (!userId || !raceId) {
      return undefined
    }
    const key = `${userId}/${raceId}`
    return subscribePredictionVersions(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key, state: 'error', value: [] }),
    )
  }, [raceId, userId])

  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) {
    return { error: null, state: 'idle' as const, value: [] }
  }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: [] }
}

export function usePredictionVersion(
  userId: string | null,
  raceId: string | undefined,
  versionId: string | undefined,
) {
  const [result, setResult] = useState<
    LiveValue<(PredictionVersionRecord<Timestamp | null> & { id: string }) | null>
  >({
    error: null, key: null, state: 'idle', value: null,
  })

  useEffect(() => {
    if (!userId || !raceId || !versionId) {
      return undefined
    }
    const key = `${userId}/${raceId}/${versionId}`
    return subscribePredictionVersion(
      userId,
      raceId,
      versionId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key, state: 'error', value: null }),
    )
  }, [raceId, userId, versionId])

  const key =
    userId && raceId && versionId ? `${userId}/${raceId}/${versionId}` : null
  if (!key) {
    return { error: null, state: 'idle' as const, value: null }
  }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: null }
}

export function usePurchasePlans(
  userId: string | null,
  raceId: string | undefined,
) {
  const [result, setResult] = useState<
    LiveValue<Array<PurchasePlanRecord<Timestamp | null>>>
  >({ error: null, key: null, state: 'idle', value: [] })

  useEffect(() => {
    if (!userId || !raceId) {
      return undefined
    }
    const key = `${userId}/${raceId}`
    return subscribePurchasePlans(
      userId,
      raceId,
      (value) => setResult({ error: null, key, state: 'ready', value }),
      (error) =>
        setResult({ error: errorMessage(error), key, state: 'error', value: [] }),
    )
  }, [raceId, userId])

  const key = userId && raceId ? `${userId}/${raceId}` : null
  if (!key) {
    return { error: null, state: 'idle' as const, value: [] }
  }
  return result.key === key
    ? result
    : { error: null, state: 'loading' as const, value: [] }
}
