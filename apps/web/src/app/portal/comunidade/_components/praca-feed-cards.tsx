import { getPracaFeedCards, type AncoraPraca, type PracaNoticiaFeedItem } from '@/lib/praca'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { PracaNoticiaFeedCard } from './praca-noticia-feed-card'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export async function ComunidadePracaFeedCards({
  escopo,
  ancora,
  currentUser,
}: {
  escopo: EscopoComunidade
  ancora: AncoraPraca
  currentUser: CurrentUser
}) {
  const cards: PracaNoticiaFeedItem[] = await getPracaFeedCards(escopo, ancora, {
    userId: currentUser.id,
  })
  if (cards.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Na praça
      </h2>
      <ul className="space-y-3">
        {cards.map((c) => (
          <li key={`${c.kind}-${c.id}`}>
            <PracaNoticiaFeedCard item={c} escopo={escopo} currentUser={currentUser} />
          </li>
        ))}
      </ul>
    </section>
  )
}
