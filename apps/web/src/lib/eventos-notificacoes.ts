import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { criarNotificacoesEmLote, notificarSafe } from '@/lib/notificacoes'

const RSVP_NOTIFICAVEL = ['CONFIRMADO', 'LISTA_ESPERA'] as const

/**
 * Avisa quem confirmou presença (ou está na espera) sobre cancelamento /
 * mudança de data ou local. Deduplica por usuário quando a série inteira
 * é afetada.
 */
export async function notificarInscritosEvento(params: {
  tenantId: string
  eventoIds: string[]
  tipo: TipoNotificacao
  titulo: string
  corpo: string
  link: string
  atorId?: string
  excetoUserId?: string
}): Promise<number> {
  if (params.eventoIds.length === 0) return 0

  const rsvps: Array<{ userId: string }> = await db.eventoRsvp.findMany({
    where: {
      eventoId: { in: params.eventoIds },
      status: { in: [...RSVP_NOTIFICAVEL] },
    },
    select: { userId: true },
    distinct: ['userId'],
  })

  const destinos = params.excetoUserId
    ? rsvps.filter((r) => r.userId !== params.excetoUserId)
    : rsvps

  return criarNotificacoesEmLote(
    destinos.map((r) => ({
      userId: r.userId,
      tenantId: params.tenantId,
      tipo: params.tipo,
      titulo: params.titulo,
      corpo: params.corpo,
      link: params.link,
      atorId: params.atorId,
    })),
  )
}

/** Confirmação 1:1 para quem embarcou — não avisa o gestor que fez o scan. */
export async function notificarCheckInEvento(opts: {
  tenantId: string
  eventoId: string
  titulo: string
  userId: string
  atorId: string
}): Promise<void> {
  if (opts.userId === opts.atorId) return
  await notificarSafe({
    userId: opts.userId,
    tenantId: opts.tenantId,
    tipo: 'EVENTO_CHECKIN',
    titulo: 'Check-in confirmado',
    corpo: `Você embarcou em “${opts.titulo}”.`,
    link: `/portal/eventos/${opts.eventoId}`,
    atorId: opts.atorId,
  })
}
