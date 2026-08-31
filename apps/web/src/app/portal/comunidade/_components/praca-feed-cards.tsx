import Link from 'next/link'
import { PracaOrigemBadge, PracaOrigemBarra } from './praca-origem-badge'
import { getPracaFeedCards, type AncoraPraca, type PracaFeedCard } from '@/lib/praca'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { formatRelative } from '@/lib/format-datetime'

export async function ComunidadePracaFeedCards({
  escopo,
  ancora,
}: {
  escopo: EscopoComunidade
  ancora: AncoraPraca
}) {
  const cards: PracaFeedCard[] = await getPracaFeedCards(escopo, ancora)
  if (cards.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Na praça
      </h2>
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={`${c.kind}-${c.id}`}>
            <Link
              href={c.href}
              className="relative block overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 pl-4 hover:border-[rgb(var(--primary)_/_0.4)]"
            >
              <PracaOrigemBarra origem={c.origem} />
              <div className="flex items-center gap-2">
                <PracaOrigemBadge origem={c.origem} />
                <span className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                  {c.meta} · {formatRelative(c.criadoEm)}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-[rgb(var(--foreground))]">{c.titulo}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
