import { useEffect, useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import type { DashboardSource } from '../../domain/types/dashboard'
import { subscribeDashboard } from '../../infrastructure/repositories/dashboard-repository'

type DashboardState =
  | { error: null; key: string | null; source: null; status: 'idle' | 'loading' }
  | { error: null; key: string; source: DashboardSource<Timestamp | null>; status: 'ready' }
  | { error: string; key: string; source: null; status: 'error' }

export function useDashboardData(userId: string | null): DashboardState {
  const [state, setState] = useState<DashboardState>({
    error: null,
    key: null,
    source: null,
    status: 'idle',
  })

  useEffect(() => {
    if (!userId) return undefined
    return subscribeDashboard(
      userId,
      (source) => setState({ error: null, key: userId, source, status: 'ready' }),
      (error) => setState({ error: error.message, key: userId, source: null, status: 'error' }),
    )
  }, [userId])

  if (!userId) {
    return { error: null, key: null, source: null, status: 'idle' }
  }
  return state.key === userId
    ? state
    : { error: null, key: userId, source: null, status: 'loading' }
}
