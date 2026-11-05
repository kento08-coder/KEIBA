import type { PropsWithChildren } from 'react'

interface StatusNoticeProps extends PropsWithChildren {
  tone?: 'info' | 'success' | 'warning' | 'error'
}
const toneClass = {
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
  success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  error: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
}

export function StatusNotice({ children, tone = 'info' }: StatusNoticeProps) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${toneClass[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
