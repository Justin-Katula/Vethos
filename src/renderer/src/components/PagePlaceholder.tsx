import { PageTransition } from './PageTransition'

type Props = {
  title: string
  subtitle: string
}

export function PagePlaceholder({ title, subtitle }: Props) {
  return (
    <PageTransition>
      <div className="flex h-full flex-col px-12 pt-16">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
        </header>
        <div className="rounded-lg border border-border-subtle bg-bg-card p-8 shadow-card">
          <p className="text-text-muted">À venir dans un prochain sous-projet.</p>
        </div>
      </div>
    </PageTransition>
  )
}
