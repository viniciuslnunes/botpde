'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { recalcularAdimplencia } from '@/lib/cobrancas'
import { notificarSafe } from '@/lib/notificacoes'
import { formatarMoedaBRL } from '@torcida/types'

const EventoIdSchema = z.string().uuid()

export type VagaActionState = { ok?: boolean; error?: string; cobrancaId?: string }

/**
 * Gera (ou reusa) cobrança AVULSA da vaga para o usuário logado nesta caravana.
 * Requer RSVP CONFIRMADO e Evento.valorVaga preenchido.
 */
export async function solicitarCobrancaVagaCaravana(
  eventoIdRaw: string,
): Promise<VagaActionState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Não autorizado' }

  const tenant = await getTenantFromHost()
  if (!tenant) return { error: 'Não autorizado' }

  const eventoIdParsed = EventoIdSchema.safeParse(eventoIdRaw)
  if (!eventoIdParsed.success) return { error: 'Evento inválido' }
  const eventoId = eventoIdParsed.data

  type EventoLite = {
    id: string
    titulo: string
    tipo: string
    data: Date
    valorVaga: { toNumber(): number } | number | null
  }
  const evento: EventoLite | null = await db.evento.findFirst({
    where: { id: eventoId, tenantId: tenant.id, tipo: 'CARAVANA' },
    select: { id: true, titulo: true, tipo: true, data: true, valorVaga: true },
  })
  if (!evento) return { error: 'Caravana não encontrada' }
  if (evento.valorVaga == null) return { error: 'Esta caravana não tem valor de vaga' }

  const valor =
    typeof evento.valorVaga === 'number' ? evento.valorVaga : evento.valorVaga.toNumber()
  if (!(valor > 0)) return { error: 'Valor da vaga inválido' }

  const rsvp: { status: string } | null = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId: session.user.id } },
    select: { status: true },
  })
  if (!rsvp || rsvp.status !== 'CONFIRMADO') {
    return { error: 'Confirme presença na caravana antes de pagar a vaga' }
  }

  const existente: { id: string; status: string } | null = await db.cobrancaAssociacao.findFirst({
    where: { eventoId, userId: session.user.id, tenantId: tenant.id },
    select: { id: true, status: true },
  })
  if (existente) {
    if (existente.status === 'CANCELADA') {
      // recria abaixo
    } else {
      redirect(`/portal/cobrancas/${existente.id}`)
    }
  }

  type MembroLite = { id: string }
  const membro: MembroLite | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { id: true },
  })
  if (!membro) return { error: 'Você precisa ser membro aprovado para pagar a vaga' }

  const vencimento = new Date(evento.data)
  vencimento.setHours(23, 59, 59, 999)

  const descricao = `Vaga · ${evento.titulo}`.slice(0, 200)

  if (existente?.status === 'CANCELADA') {
    await db.cobrancaAssociacao.update({
      where: { id: existente.id },
      data: {
        status: 'PENDENTE',
        valor,
        descricao,
        vencimento,
        pagoEm: null,
        metodoPagamento: null,
        pixCopiaCola: null,
        gatewayProvider: null,
        gatewayExternalId: null,
        tipo: 'AVULSA',
        membroId: membro.id,
      },
    })
    await recalcularAdimplencia(tenant.id, session.user.id)
    await notificarSafe({
      userId: session.user.id,
      tenantId: tenant.id,
      tipo: 'COBRANCA_PENDENTE',
      titulo: 'Cobrança da vaga disponível',
      corpo: `${descricao} · ${formatarMoedaBRL(valor)}`,
      link: `/portal/cobrancas/${existente.id}`,
    })
    revalidatePath(`/portal/caravanas/${eventoId}`)
    revalidatePath('/portal/cobrancas')
    redirect(`/portal/cobrancas/${existente.id}`)
  }

  const cobranca = await db.cobrancaAssociacao.create({
    data: {
      tenantId: tenant.id,
      userId: session.user.id,
      membroId: membro.id,
      eventoId,
      tipo: 'AVULSA',
      descricao,
      valor,
      vencimento,
      status: 'PENDENTE',
      criadoPorId: session.user.id,
    },
    select: { id: true },
  })

  await recalcularAdimplencia(tenant.id, session.user.id)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_VAGA_CARAVANA',
      entidade: 'CobrancaAssociacao',
      entidadeId: cobranca.id,
      detalhes: { eventoId, valor },
    },
  })

  await notificarSafe({
    userId: session.user.id,
    tenantId: tenant.id,
    tipo: 'COBRANCA_PENDENTE',
    titulo: 'Cobrança da vaga disponível',
    corpo: `${descricao} · ${formatarMoedaBRL(valor)}`,
    link: `/portal/cobrancas/${cobranca.id}`,
  })

  revalidatePath(`/portal/caravanas/${eventoId}`)
  revalidatePath('/portal/cobrancas')
  revalidatePath('/portal/departamentos/caravanas')
  redirect(`/portal/cobrancas/${cobranca.id}`)
}
