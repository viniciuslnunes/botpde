/**
 * Cobrança AVULSA da vaga de caravana — criação sem redirect.
 * Usada no RSVP (auto) e no CTA "Pagar vaga".
 */

import { db } from '@torcida/db'
import { recalcularAdimplencia } from '@/lib/cobrancas'
import { notificarSafe } from '@/lib/notificacoes'
import { formatarMoedaBRL, temValorVaga } from '@torcida/types'

export type GarantirCobrancaVagaResult =
  | { ok: true; cobrancaId: string; criada: boolean }
  | { ok: false; error: string }

/**
 * Garante cobrança PENDENTE (ou reusa existente não-cancelada) para o usuário
 * neste evento. Não redireciona — o caller decide a UX.
 */
export async function garantirCobrancaVagaCaravana(opts: {
  tenantId: string
  userId: string
  eventoId: string
  /** Se true, notifica e grava AuditLog (fluxo explícito "Pagar vaga"). */
  notificar?: boolean
}): Promise<GarantirCobrancaVagaResult> {
  type EventoLite = {
    id: string
    titulo: string
    tipo: string
    data: Date
    valorVaga: { toNumber(): number } | number | null
  }
  const evento: EventoLite | null = await db.evento.findFirst({
    where: { id: opts.eventoId, tenantId: opts.tenantId, tipo: 'CARAVANA' },
    select: { id: true, titulo: true, tipo: true, data: true, valorVaga: true },
  })
  if (!evento) return { ok: false, error: 'Caravana não encontrada' }

  const valor =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()
  if (!temValorVaga(valor)) return { ok: false, error: 'Esta caravana não tem valor de vaga' }

  const rsvp: { status: string } | null = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId: opts.eventoId, userId: opts.userId } },
    select: { status: true },
  })
  if (!rsvp || rsvp.status !== 'CONFIRMADO') {
    return { ok: false, error: 'Confirme presença na caravana antes de pagar a vaga' }
  }

  const existente: { id: string; status: string } | null = await db.cobrancaAssociacao.findFirst({
    where: { eventoId: opts.eventoId, userId: opts.userId, tenantId: opts.tenantId },
    select: { id: true, status: true },
  })
  if (existente && existente.status !== 'CANCELADA') {
    return { ok: true, cobrancaId: existente.id, criada: false }
  }

  const membro: { id: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: opts.tenantId, userId: opts.userId } },
    select: { id: true },
  })
  if (!membro) return { ok: false, error: 'Você precisa ser membro aprovado para pagar a vaga' }

  const vencimento = new Date(evento.data)
  vencimento.setHours(23, 59, 59, 999)
  const descricao = `Vaga · ${evento.titulo}`.slice(0, 200)
  const valorNum = valor as number

  let cobrancaId: string
  if (existente?.status === 'CANCELADA') {
    await db.cobrancaAssociacao.update({
      where: { id: existente.id },
      data: {
        status: 'PENDENTE',
        valor: valorNum,
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
    cobrancaId = existente.id
  } else {
    const cobranca = await db.cobrancaAssociacao.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        membroId: membro.id,
        eventoId: opts.eventoId,
        tipo: 'AVULSA',
        descricao,
        valor: valorNum,
        vencimento,
        status: 'PENDENTE',
        criadoPorId: opts.userId,
      },
      select: { id: true },
    })
    cobrancaId = cobranca.id
  }

  await recalcularAdimplencia(opts.tenantId, opts.userId)

  if (opts.notificar !== false) {
    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        atorId: opts.userId,
        acao: 'COBRANCA_VAGA_CARAVANA',
        entidade: 'CobrancaAssociacao',
        entidadeId: cobrancaId,
        detalhes: { eventoId: opts.eventoId, valor: valorNum },
      },
    })
    await notificarSafe({
      userId: opts.userId,
      tenantId: opts.tenantId,
      tipo: 'COBRANCA_PENDENTE',
      titulo: 'Cobrança da vaga disponível',
      corpo: `${descricao} · ${formatarMoedaBRL(valorNum)}`,
      link: `/portal/cobrancas/${cobrancaId}`,
    })
  }

  return { ok: true, cobrancaId, criada: true }
}
