import type { ReactNode } from 'react'

interface PageIntroProps {
  action?: ReactNode
  description: string
  eyebrow: string
  title: string
}

export function PageIntro({
  action,
  description,
  eyebrow,
  title,
}: PageIntroProps) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title mt-2">{title}</h1>
        <p className="muted-copy mt-3 max-w-2xl">{description}</p>
      </div>
      {action}
    </div>
  )
}
