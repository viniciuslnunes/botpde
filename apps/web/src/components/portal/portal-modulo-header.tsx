import type { ReactNode } from 'react'

/** Cabeçalho dos módulos do canal — mesmo vocabulário tipográfico da Loja. */
export function PortalModuloHeader({
  kicker,
  title,
  description,
  actions,
  size = 'hub',
  bordered = true,
}: {
  kicker?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  size?: 'hub' | 'page'
  bordered?: boolean
}) {
  return (
    <div
      className={[
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        bordered ? 'border-b border-[rgb(var(--border))] pb-6' : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        {kicker ? (
          <p className="portal-kicker text-[rgb(var(--foreground-muted))]">{kicker}</p>
        ) : null}
        <h1
          className={[
            'portal-display text-[rgb(var(--foreground))]',
            kicker ? 'mt-3' : '',
            size === 'hub' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
          ].join(' ')}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
