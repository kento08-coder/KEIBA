import { LogIn, LogOut } from 'lucide-react'
import { useAuth } from './useAuth'

export function AuthButton() {
  const { signIn, signOut, status, user } = useAuth()

  if (status === 'unconfigured') {
    return (
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200">
        Firebase未設定
      </span>
    )
  }

  if (status === 'checking') {
    return (
      <span className="text-sm text-muted" role="status">
        認証を確認中…
      </span>
    )
  }

  if (user) {
    return (
      <button className="button-secondary" onClick={() => void signOut()} type="button">
        <LogOut aria-hidden="true" size={17} />
        <span className="hidden sm:inline">ログアウト</span>
      </button>
    )
  }

  return (
    <button className="button-primary" onClick={() => void signIn()} type="button">
      <LogIn aria-hidden="true" size={17} />
      Googleでログイン
    </button>
  )
}
