import { Construction } from 'lucide-react'

interface EmptyStateProps {
  availableFrom: string
  description: string
  title: string
}

export function EmptyState({
  availableFrom,
  description,
  title,
}: EmptyStateProps) {
  return (
    <section className="card-surface mt-8 grid min-h-72 place-items-center p-6 text-center sm:p-10">
      <div className="max-w-xl">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-accent/10 text-teal-accent">
          <Construction aria-hidden="true" size={26} />
        </span>
        <p className="eyebrow mt-5">{availableFrom}</p>
        <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
        <p className="muted-copy mt-3">{description}</p>
      </div>
    </section>
  )
}
