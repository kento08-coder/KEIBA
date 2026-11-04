import { createContext } from 'react'
import type { User } from 'firebase/auth'

export type AuthStatus =
  | 'checking'
  | 'signed-out'
  | 'signed-in'
  | 'unconfigured'

export interface AuthContextValue {
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  status: AuthStatus
  user: User | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
