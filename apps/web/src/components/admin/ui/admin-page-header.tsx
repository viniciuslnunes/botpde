import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export interface AdminPageHeaderProps {
  title: string
  description?: string
  /** Ícone já dimensionado (ex.: `<Wallet className="h-5 w-5" />`). */
  icon?: ReactNode
  /** Ações à direita (botões, links). */
  actions?: ReactNode
  backHref?: string
}

/** Cabeçalho padrão das páginas admin — server-safe (sem Motion). */
export function AdminPageHeader({ title, description, icon, actions, backHref }: AdminPageHeaderProps) {
  return (
    <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
      <div className="app-container flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Voltar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          {icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{title}</h1>
            {description ? (
              <p className="mt-0.5 truncate text-sm text-[rgb(var(--foreground-muted))]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
