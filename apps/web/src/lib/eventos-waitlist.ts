import { db } from '@torcida/db'
import { capacidadeEfetiva, lotacaoCheia } from '@/lib/eventos-capacidade'
import { notificarSafe } from '@/lib/notificacoes'

/**
 * Quando abre vaga (alguém saiu de CONFIRMADO), promove o mais antigo
 * da LISTA_ESPERA e notifica. Retorna userId promovido ou null.
 */
export async function promoverProximoDaEspera(eventoId: string): Promise<string | null> {
  const evento = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      id: true,
      tenantId: true,
      titulo: true,
      capacidade: true,
      sede: { select: { capacidade: true } },
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  if (!evento) return null

  const cap = capacidadeEfetiva(evento)
  if (lotacaoCheia(evento._count.rsvps, cap)) return null

  type EsperaLite = { userId: string }
  const proximo: EsperaLite | null = await db.eventoRsvp.findFirst({
    where: { eventoId, status: 'LISTA_ESPERA' },
    orderBy: { criadoEm: 'asc' },
    select: { userId: true },
  })
  if (!proximo) return null

  await db.eventoRsvp.update({
    where: { eventoId_userId: { eventoId, userId: proximo.userId } },
    data: { status: 'CONFIRMADO' },
  })

  await notificarSafe({
    userId: proximo.userId,
    tenantId: evento.tenantId,
    tipo: 'EVENTO_RSVP',
    titulo: 'Vaga liberada',
    corpo: `Você saiu da lista de espera e está confirmado em “${evento.titulo}”.`,
    link: `/portal/eventos/${eventoId}`,
  })

  return proximo.userId
}
