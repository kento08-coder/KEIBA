import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand() {
  return (
    <Link
      aria-label="KEIBA ホーム"
      className="inline-flex items-center gap-3 rounded-lg"
      to="/"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-teal-accent text-navy-950 shadow-lg shadow-teal-accent/10">
        <Activity aria-hidden="true" size={22} strokeWidth={2.5} />
      </span>
      <span>
        <strong className="block text-base leading-none tracking-[0.12em] text-white">
          KEIBA
        </strong>
        <span className="mt-1 block text-[0.65rem] font-semibold tracking-wide text-muted">
          RACE ANALYTICS
        </span>
      </span>
    </Link>
  )
}
