import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export interface AdminPageHeaderProps {
  title: string
  description?: ReactNode
  /** Ícone já dimensionado (ex.: `<Wallet className="h-5 w-5" />`). */
  icon?: ReactNode
  /** Ações à direita (botões, links). */
  actions?: ReactNode
  backHref?: string
  /**
   * Chrome abaixo do título (tabs, toolbar). O ritmo é do kit:
   * título ↔ descrição 12px; bloco do título ↔ chrome 20px; peças do chrome 12px.
   */
  children?: ReactNode
}

/** Cabeçalho padrão das páginas admin — server-safe (sem Motion). */
export function AdminPageHeader({
  title,
  description,
  icon,
  actions,
  backHref,
  children,
}: AdminPageHeaderProps) {
  return (
    <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
      <div className={['app-container', children ? 'space-y-5' : ''].filter(Boolean).join(' ')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {backHref ? (
              <Link
                href={backHref}
                aria-label="Voltar"
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
            {icon ? (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 space-y-3">
              <h1 className="portal-display text-xl text-[rgb(var(--foreground))] sm:text-2xl">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {children ? <div className="space-y-3">{children}</div> : null}
      </div>
    </div>
  )
}
