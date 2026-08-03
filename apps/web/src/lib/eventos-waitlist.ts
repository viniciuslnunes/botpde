import { db } from '@torcida/db'
import { capacidadeEfetiva, lotacaoCheia, contarOcupacaoEvento } from '@/lib/eventos-capacidade'
import { notificarSafe } from '@/lib/notificacoes'
import { garantirCobrancaVagaCaravana } from '@/lib/caravana-vaga'
import { temValorVaga } from '@torcida/types'

/**
 * Quando abre vaga (alguém saiu de CONFIRMADO / vaga paga liberada), promove
 * o mais antigo da LISTA_ESPERA e notifica. Em caravana paga, ocupação = PAGOs.
 */
export async function promoverProximoDaEspera(eventoId: string): Promise<string | null> {
  const evento = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      id: true,
      tenantId: true,
      titulo: true,
      tipo: true,
      capacidade: true,
      valorVaga: true,
      sede: { select: { capacidade: true } },
    },
  })
  if (!evento) return null

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  const cap = capacidadeEfetiva(evento)
  const ocupados = await contarOcupacaoEvento({
    tenantId: evento.tenantId,
    eventoId,
    valorVaga: valorVagaNum,
  })
  if (lotacaoCheia(ocupados, cap)) return null

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

  if (evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)) {
    await garantirCobrancaVagaCaravana({
      tenantId: evento.tenantId,
      userId: proximo.userId,
      eventoId,
      notificar: true,
    })
  }

  await notificarSafe({
    userId: proximo.userId,
    tenantId: evento.tenantId,
    tipo: 'EVENTO_RSVP',
    titulo: 'Vaga liberada',
    corpo: temValorVaga(valorVagaNum)
      ? `Você saiu da lista de espera em “${evento.titulo}”. Pague a vaga para garantir o lugar.`
      : `Você saiu da lista de espera e está confirmado em “${evento.titulo}”.`,
    link: `/portal/eventos/${eventoId}`,
  })

  return proximo.userId
}
