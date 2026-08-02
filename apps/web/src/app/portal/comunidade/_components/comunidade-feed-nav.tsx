import { getResumoBadgesComunidade } from '@/lib/notificacoes-comunidade'
import { ComunidadeFeedNavClient } from './comunidade-feed-nav-client'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

export function ComunidadeFeedNavFallback() {
  return (
    <nav className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-3 py-2"
          aria-hidden
        >
          <div className="h-4 w-4 animate-pulse rounded bg-[rgb(var(--border))]" />
          <div className="h-4 flex-1 animate-pulse rounded bg-[rgb(var(--border))]" />
        </div>
      ))}
    </nav>
  )
}

export async function ComunidadeFeedNav({
  tenantId,
  userId,
  currentUserId,
  mostrarBalanco = false,
  escopo = 'torcida',
}: {
  tenantId: string
  userId: string
  currentUserId: string
  mostrarBalanco?: boolean
  escopo?: EscopoComunidade
}) {
  const badges = await getResumoBadgesComunidade(tenantId, userId)

  return (
    <ComunidadeFeedNavClient
      currentUserId={currentUserId}
      solicitacoesPendentes={badges.solicitacoesPendentes}
      mostrarBalanco={mostrarBalanco}
      escopo={escopo}
    />
  )
}
