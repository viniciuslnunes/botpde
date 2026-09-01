import { MessagesSquare, Newspaper, Pin } from 'lucide-react'
import { rotuloOrigemPraca } from '@torcida/types'

export type ModuloPraca = 'forum' | 'noticias'

const CLASSE: Record<'imprensa' | 'oficial' | 'verificada' | 'forum', string> = {
  imprensa:
    'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]',
  oficial:
    'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))]',
  verificada:
    'border border-[rgb(var(--border))] text-[rgb(var(--foreground))]',
  forum: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

export function PracaOrigemBadge({
  origem,
}: {
  origem: 'imprensa' | 'oficial' | 'verificada' | 'forum'
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CLASSE[origem]}`}
    >
      {rotuloOrigemPraca(origem)}
    </span>
  )
}

const MODULO_ICONE = {
  forum: MessagesSquare,
  noticias: Newspaper,
} as const

const badgeModuloClass =
  'inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]'

/** Módulo de destino no feed (Fórum / Notícias) — não confunde com origem da matéria. */
export function PracaModuloBadge({ modulo }: { modulo: ModuloPraca }) {
  const Icone = MODULO_ICONE[modulo]
  return (
    <span className={badgeModuloClass}>
      <Icone className="h-3 w-3" aria-hidden />
      {modulo === 'forum' ? 'Fórum' : 'Notícias'}
    </span>
  )
}

export function FixadoBadge() {
  return (
    <span className={badgeModuloClass}>
      <Pin className="h-3 w-3" aria-hidden />
      Fixado
    </span>
  )
}

const BARRA: Record<'imprensa' | 'oficial' | 'verificada' | 'forum', string> = {
  imprensa: 'bg-[rgb(var(--foreground-muted))]',
  oficial: 'bg-[rgb(var(--color-primary))]',
  verificada: 'bg-[rgb(var(--color-primary-fg))]',
  forum: 'bg-[rgb(var(--border))]',
}

export function PracaOrigemBarra({
  origem,
}: {
  origem: 'imprensa' | 'oficial' | 'verificada' | 'forum'
}) {
  return <span aria-hidden className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${BARRA[origem]}`} />
}
