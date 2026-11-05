import { Menu, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { AuthButton } from '../features/auth/AuthButton'
import { navigationItems } from './navigation'

function navLinkClass(isActive: boolean) {
  return [
    'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
    isActive
      ? 'bg-teal-accent/12 text-teal-accent ring-1 ring-teal-accent/20'
      : 'text-muted hover:bg-white/5 hover:text-white',
  ].join(' ')
}

export function AppShell() {
  const mobileItems = navigationItems.filter((item) => item.primary)

  return (
    <div className="min-h-screen bg-navy-950 text-copy">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-line/70 bg-navy-950/95 p-5 backdrop-blur md:flex">
        <Brand />
        <nav aria-label="メインナビゲーション" className="mt-10 space-y-2">
          {navigationItems.map(({ icon: Icon, label, path }) => (
            <NavLink
              className={({ isActive }) => navLinkClass(isActive)}
              end={path === '/'}
              key={path}
              to={path}
            >
              <Icon aria-hidden="true" size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-slate-line/70 bg-slate-card/70 p-4">
          <p className="eyebrow">Phase 1 / M4</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            予算上限内で3方式の購入プランを比較し、不変スナップショットとして保存します。
          </p>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-line/70 bg-navy-950/85 backdrop-blur-xl">
          <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="hidden items-center gap-2 text-sm text-muted md:flex">
              <Menu aria-hidden="true" size={18} />
              個人用ワークスペース
            </div>
            <div className="flex items-center gap-2">
              <NavLink
                aria-label="設定"
                className={({ isActive }) =>
                  `grid size-11 place-items-center rounded-xl border transition md:hidden ${
                    isActive
                      ? 'border-teal-accent/50 bg-teal-accent/10 text-teal-accent'
                      : 'border-slate-line bg-navy-900 text-muted'
                  }`
                }
                to="/settings"
              >
                <Settings aria-hidden="true" size={19} />
              </NavLink>
              <div className="hidden sm:block">
                <AuthButton />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pt-7 pb-28 sm:px-6 md:pb-10 lg:px-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="モバイルナビゲーション"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-line bg-navy-950/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      >
        {mobileItems.map(({ icon: Icon, label, path }) => (
          <NavLink
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[0.7rem] font-bold transition ${
                isActive ? 'text-teal-accent' : 'text-muted'
              }`
            }
            end={path === '/'}
            key={path}
            to={path}
          >
            <Icon aria-hidden="true" size={21} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
