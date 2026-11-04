import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { firebaseAuth } from '../../infrastructure/firebase/client'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context'

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '認証処理で予期しないエラーが発生しました。'
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(
    firebaseAuth ? 'checking' : 'unconfigured',
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      return undefined
    }

    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser)
        setStatus(nextUser ? 'signed-in' : 'signed-out')
        setError(null)
      },
      (nextError) => {
        setStatus('signed-out')
        setError(nextError.message)
      },
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      status,
      user,
      signIn: async () => {
        if (!firebaseAuth) {
          setError('Firebaseの環境変数が未設定です。')
          return
        }

        try {
          setError(null)
          const provider = new GoogleAuthProvider()
          provider.setCustomParameters({ prompt: 'select_account' })
          await signInWithPopup(firebaseAuth, provider)
        } catch (nextError) {
          setError(getErrorMessage(nextError))
        }
      },
      signOut: async () => {
        if (!firebaseAuth) {
          return
        }

        try {
          setError(null)
          await firebaseSignOut(firebaseAuth)
        } catch (nextError) {
          setError(getErrorMessage(nextError))
        }
      },
    }),
    [error, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
