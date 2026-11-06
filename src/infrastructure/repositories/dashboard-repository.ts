import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import type {
  BankrollTransactionRecord,
  PredictionVersionRecord,
  PurchasePlanRecord,
  PurchaseRecord,
  RaceRecord,
  ResultRecord,
} from '../../domain/types/firestore'
import type {
  DashboardRaceSource,
  DashboardSource,
} from '../../domain/types/dashboard'
import { firestore } from '../firebase/client'

export const DASHBOARD_RACE_LIMIT = 200

type FirestoreTimestamp = Timestamp | null
type RaceSource = DashboardRaceSource<FirestoreTimestamp>

interface LiveRaceEntry {
  data: RaceSource
  ready: Set<'plans' | 'predictionVersions' | 'purchases' | 'results'>
  unsubscribe: Unsubscribe[]
}

function requireFirestore() {
  if (!firestore) {
    throw new Error('Firebaseが未設定です。設定画面を確認してください。')
  }
  return firestore
}

export function subscribeDashboard(
  userId: string,
  onData: (source: DashboardSource<FirestoreTimestamp>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireFirestore()
  const entries = new Map<string, LiveRaceEntry>()
  let orderedRaceIds: string[] = []
  let ledger: Array<BankrollTransactionRecord<FirestoreTimestamp>> = []
  let ledgerReady = false
  let truncated = false
  let stopped = false

  const emit = () => {
    if (
      stopped ||
      !ledgerReady ||
      orderedRaceIds.some((raceId) => entries.get(raceId)?.ready.size !== 4)
    ) return
    onData({
      ledgerTransactions: ledger,
      races: orderedRaceIds.flatMap((raceId) => {
        const entry = entries.get(raceId)
        return entry ? [entry.data] : []
      }),
      truncated,
    })
  }

  const fail = (error: Error) => {
    if (!stopped) onError(error)
  }

  const startRaceSubscriptions = (race: RaceRecord<FirestoreTimestamp>) => {
    const raceId = race.raceId
    const entry: LiveRaceEntry = {
      data: {
        plans: [],
        predictionVersions: [],
        purchases: [],
        race,
        results: [],
      },
      ready: new Set(),
      unsubscribe: [],
    }
    entries.set(raceId, entry)
    const path = ['users', userId, 'races', raceId] as const

    entry.unsubscribe.push(
      onSnapshot(
        collection(db, ...path, 'purchases'),
        (snapshot) => {
          entry.data.purchases = snapshot.docs.map(
            (document) => document.data() as PurchaseRecord<FirestoreTimestamp>,
          )
          entry.ready.add('purchases')
          emit()
        },
        fail,
      ),
      onSnapshot(
        collection(db, ...path, 'results'),
        (snapshot) => {
          entry.data.results = snapshot.docs.map(
            (document) => document.data() as ResultRecord<FirestoreTimestamp>,
          )
          entry.ready.add('results')
          emit()
        },
        fail,
      ),
      onSnapshot(
        collection(db, ...path, 'plans'),
        (snapshot) => {
          entry.data.plans = snapshot.docs.map(
            (document) => document.data() as PurchasePlanRecord<FirestoreTimestamp>,
          )
          entry.ready.add('plans')
          emit()
        },
        fail,
      ),
      onSnapshot(
        collection(db, ...path, 'predictionVersions'),
        (snapshot) => {
          entry.data.predictionVersions = snapshot.docs.map((document) => ({
            id: document.id,
            ...(document.data() as PredictionVersionRecord<FirestoreTimestamp>),
          }))
          entry.ready.add('predictionVersions')
          emit()
        },
        fail,
      ),
    )
  }

  const raceUnsubscribe = onSnapshot(
    query(
      collection(db, 'users', userId, 'races'),
      orderBy('date', 'desc'),
      limit(DASHBOARD_RACE_LIMIT + 1),
    ),
    (snapshot) => {
      const races = snapshot.docs.map(
        (document) => document.data() as RaceRecord<FirestoreTimestamp>,
      )
      truncated = races.length > DASHBOARD_RACE_LIMIT
      const selected = races.slice(0, DASHBOARD_RACE_LIMIT)
      const nextIds = new Set(selected.map((race) => race.raceId))
      for (const [raceId, entry] of entries) {
        if (!nextIds.has(raceId)) {
          entry.unsubscribe.forEach((unsubscribe) => unsubscribe())
          entries.delete(raceId)
        }
      }
      for (const race of selected) {
        const existing = entries.get(race.raceId)
        if (existing) existing.data.race = race
        else startRaceSubscriptions(race)
      }
      orderedRaceIds = selected.map((race) => race.raceId)
      emit()
    },
    fail,
  )

  const ledgerUnsubscribe = onSnapshot(
    collection(db, 'users', userId, 'bankrollTransactions'),
    (snapshot) => {
      ledger = snapshot.docs.map(
        (document) =>
          document.data() as BankrollTransactionRecord<FirestoreTimestamp>,
      )
      ledgerReady = true
      emit()
    },
    fail,
  )

  return () => {
    stopped = true
    raceUnsubscribe()
    ledgerUnsubscribe()
    entries.forEach((entry) => entry.unsubscribe.forEach((unsubscribe) => unsubscribe()))
    entries.clear()
  }
}
