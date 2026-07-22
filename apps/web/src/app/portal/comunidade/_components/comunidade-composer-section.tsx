import dynamic from 'next/dynamic'
import { db } from '@torcida/db'
import { getComposerContext } from './composer-context'
import type { EventoComposerItem } from '@/lib/eventos'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

export async function ComunidadeComposerSection({
  tenantId,
  tenantNome,
  userId,
  userName,
  userAvatar,
  eventoIdInicial,
}: {
  tenantId: string
  tenantNome: string
  userId: string
  userName: string | null
  userAvatar: string | null
  eventoIdInicial?: string
}) {
  const ctx = await getComposerContext(tenantId, userId, userName)

  let eventos = ctx.eventosComposer
  if (eventoIdInicial && !eventos.some((e) => e.id === eventoIdInicial)) {
    type EvLite = { id: string; titulo: string; data: Date; local: string | null }
    const extra: EvLite | null = await db.evento.findFirst({
      where: { id: eventoIdInicial, tenantId, data: { gte: new Date() } },
      select: { id: true, titulo: true, data: true, local: true },
    })
    if (extra) {
      const item: EventoComposerItem = {
        id: extra.id,
        titulo: extra.titulo,
        data: extra.data.toISOString(),
        local: extra.local,
      }
      eventos = [item, ...eventos]
    }
  }

  return (
    <FeedComposer
      userId={userId}
      userName={ctx.nome}
      userAvatar={userAvatar}
      tenantId={tenantId}
      tenantNome={tenantNome}
      perfilPrivado={ctx.perfilPrivado}
      eventos={eventos}
      bloqueioPublicacao={ctx.bloqueioPublicacao}
      somentePublico={ctx.somentePublico}
      eventoIdInicial={eventoIdInicial}
      autorBadges={{
        cargoNome: ctx.userCard.cargoNome,
        departamentoNome: ctx.userCard.departamentoNome,
        sedeNome: ctx.userCard.sedeNome,
      }}
    />
  )
}
