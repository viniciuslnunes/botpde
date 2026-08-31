import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BRECHO_AVISO_PLATAFORMA } from '@torcida/types'

export function BrechoChrome({
  title,
  description,
  minhaLoja,
  compact,
}: {
  title: string
  description?: string
  minhaLoja?: boolean
  /** Vitrine do sócio: some o h1 grande — o nome fica no bloco da capa. */
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          href="/portal/loja"
          className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Todas as lojas
        </Link>
        {compact ? (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            [ Brechó · sócios ]
          </p>
        ) : (
          <>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
              [ Brechó · sócios ]
            </p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-xl text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
            ) : null}
          </>
        )}
      </div>
      <nav className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Link
          href="/portal/loja/brecho"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))]"
        >
          Anúncios
        </Link>
        <Link
          href="/portal/loja/brecho/lojas"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))]"
        >
          Confiáveis
        </Link>
        <Link
          href="/portal/loja/brecho/minha-loja"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--color-primary)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
        >
          {minhaLoja ? 'Minha loja' : 'Abrir loja'}
        </Link>
      </nav>
    </div>
  )
}

export function BrechoAviso() {
  return (
    <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
      {BRECHO_AVISO_PLATAFORMA}
    </p>
  )
}
