import { Star } from 'lucide-react'
import { rotuloTrocasBrecho } from '@torcida/types'

/**
 * Ranking visual da loja P2P: 0–5 estrelas nesta praça + quantas trocas
 * (venda, troca ou doação confirmada pelos dois lados).
 */
export function BrechoConfiancaMarca({
  estrelas,
  trocas,
  size = 'sm',
}: {
  estrelas: number
  trocas: number
  size?: 'sm' | 'md'
}) {
  const n = Math.max(0, Math.min(5, Math.round(Number(estrelas) || 0)))
  const px = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const label = `${n} de 5 estrelas nesta praça · ${rotuloTrocasBrecho(trocas)}`

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={label}>
      <span className="inline-flex shrink-0" role="img" aria-label={label}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            aria-hidden
            className={`${px} ${
              i < n
                ? 'text-[rgb(var(--color-primary-fg))]'
                : 'text-[rgb(var(--foreground-muted)_/_0.55)]'
            }`}
            fill={i < n ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.75}
          />
        ))}
      </span>
      <span className="truncate font-mono text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
        {rotuloTrocasBrecho(trocas)}
      </span>
    </span>
  )
}
