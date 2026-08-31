import { rotuloOrigemPraca } from '@torcida/types'

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
