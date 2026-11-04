import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

const configEntries = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
} as const

export const missingFirebaseEnvironmentVariables = Object.entries(configEntries)
  .filter(([, value]) => value.length === 0)
  .map(([key]) => key)

export const isFirebaseConfigured =
  missingFirebaseEnvironmentVariables.length === 0

const useEmulators =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS?.toLowerCase() === 'true'

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firestore: Firestore | null = null

if (isFirebaseConfigured) {
  firebaseApp = getApps().length === 0 ? initializeApp(configEntries) : getApp()
  firebaseAuth = getAuth(firebaseApp)
  firestore = getFirestore(firebaseApp)

  if (useEmulators) {
    connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  }
}

export { firebaseApp, firebaseAuth, firestore, useEmulators }
