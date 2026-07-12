import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ComunidadePageHeaderProps {
  icon: LucideIcon
  titulo: string
  subtitulo?: string
  voltarHref?: string
  /** Ação opcional à direita (ex.: botão de criar). */
  acao?: React.ReactNode
}

/**
 * Cabeçalho padrão das subpáginas da Comunidade no estilo social: botão de
 * voltar arredondado + chip com o ícone da seção + título/subtítulo, com
 * espaço para uma ação à direita. Mantém a identidade em todas as telas.
 */
export function ComunidadePageHeader({
  icon: Icon,
  titulo,
  subtitulo,
  voltarHref = '/portal/comunidade',
  acao,
}: ComunidadePageHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      <Link
        href={voltarHref}
        aria-label="Voltar ao feed"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </Link>

      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]">
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">
          {titulo}
        </h1>
        {subtitulo && (
          <p className="mt-0.5 truncate text-sm text-[rgb(var(--foreground-muted))]">{subtitulo}</p>
        )}
      </div>

      {acao && <div className="shrink-0">{acao}</div>}
    </header>
  )
}
