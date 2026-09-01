import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { PracaModuloBadge } from './praca-origem-badge'
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
              className="card-soft block rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--primary)_/_0.4)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                  {c.meta} · {formatRelative(c.criadoEm)}
                </span>
                <PracaModuloBadge modulo="noticias" />
              </div>
              <p className="mt-1.5 text-sm font-semibold text-[rgb(var(--foreground))]">{c.titulo}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                <Newspaper className="h-3.5 w-3.5" aria-hidden />
                Ver nas notícias
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
