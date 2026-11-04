import { CheckCircle2, CircleAlert, Cloud, ShieldCheck } from 'lucide-react'
import { PageIntro } from '../components/PageIntro'
import { AuthButton } from '../features/auth/AuthButton'
import { useAuth } from '../features/auth/useAuth'
import {
  isFirebaseConfigured,
  missingFirebaseEnvironmentVariables,
  useEmulators,
} from '../infrastructure/firebase/client'

export function SettingsPage() {
  const { error, status, user } = useAuth()

  return (
    <div>
      <PageIntro
        description="Firebase接続、Googleログイン、データ保護の状態を確認します。"
        eyebrow="Settings"
        title="設定"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card-surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-teal-accent/10 text-teal-accent">
              <Cloud aria-hidden="true" size={22} />
            </span>
            <div>
              <p className="eyebrow">Firebase</p>
              <h2 className="mt-1 text-lg font-bold text-white">クラウド接続</h2>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-line bg-navy-900 p-4">
            {isFirebaseConfigured ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-teal-accent" size={20} />
            ) : (
              <CircleAlert className="mt-0.5 shrink-0 text-amber-300" size={20} />
            )}
            <div>
              <p className="font-bold text-white">
                {isFirebaseConfigured ? '環境変数を検出しました' : 'Firebaseは未設定です'}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {isFirebaseConfigured
                  ? `${useEmulators ? 'Emulator' : 'Firebaseプロジェクト'}へ接続する準備ができています。`
                  : '.env.exampleを.env.localへコピーし、Firebase Consoleの値を入力してください。'}
              </p>
            </div>
          </div>

          {!isFirebaseConfigured && (
            <p className="mt-4 break-words text-xs leading-5 text-muted">
              未設定項目: {missingFirebaseEnvironmentVariables.join(', ')}
            </p>
          )}
        </section>

        <section className="card-surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-teal-accent/10 text-teal-accent">
              <ShieldCheck aria-hidden="true" size={22} />
            </span>
            <div>
              <p className="eyebrow">Authentication</p>
              <h2 className="mt-1 text-lg font-bold text-white">Googleログイン</h2>
            </div>
          </div>

          <dl className="mt-6 space-y-3 rounded-xl border border-slate-line bg-navy-900 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">状態</dt>
              <dd className="text-right font-semibold text-white">
                {status === 'signed-in'
                  ? 'ログイン済み'
                  : status === 'checking'
                    ? '確認中'
                    : status === 'unconfigured'
                      ? 'Firebase未設定'
                      : '未ログイン'}
              </dd>
            </div>
            {user && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">アカウント</dt>
                <dd className="truncate text-right font-semibold text-white">
                  {user.email ?? user.displayName ?? user.uid}
                </dd>
              </div>
            )}
          </dl>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5">
            <AuthButton />
          </div>
        </section>
      </div>

      <section className="card-surface mt-6 p-5 sm:p-6">
        <p className="eyebrow">Security boundary</p>
        <h2 className="mt-2 text-lg font-bold text-white">ユーザーごとのデータ分離</h2>
        <p className="muted-copy mt-3">
          Firestore Rulesは、ログインUIDと一致する <code className="text-teal-200">/users/&#123;uid&#125;/**</code>{' '}
          だけを許可します。未認証・別UID・ユーザー領域外へのアクセスは拒否します。
        </p>
      </section>
    </div>
  )
}
