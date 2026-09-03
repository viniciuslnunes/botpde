'use server'

import { z } from 'zod'
import { db } from '@torcida/db'
import type { TrechoEmbarque } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { podeAutoEmbarcar, temValorVaga } from '@torcida/types'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { carregarCobrancasVagaEvento } from '@/lib/eventos-tipo'
import { gravarCheckinEmbarque } from '@/lib/embarque'
import { janelaEmbarqueValida, lerQrEmbarque } from '@/lib/embarque-qr'
import { extrairPayloadDeQr } from '@/lib/qr-token'
import { registrarSinalConfiancaSafe } from '@/lib/confianca'

/**
 * Auto-embarque: o sócio escaneia o QR rotativo que o gestor exibe e registra
 * o próprio embarque.
 *
 * **O gate aqui não é `EVENTS_MANAGE`.** Quem age é a pessoa sobre si mesma,
 * não um gestor sobre terceiros: exigir a permissão do admin travaria o fluxo
 * inteiro, e reusar a action do admin daria a qualquer sócio o poder de
 * embarcar outra pessoa. O critério é outro — sessão válida, vínculo ativo com
 * a torcida do evento, RSVP confirmado e o QR dentro da janela.
 *
 * Também **não há override**: na porta do ônibus o gestor pode liberar quem
 * não pagou porque ele está ali decidindo. Aqui não há ninguém decidindo, então
 * `checkInExigePagamento` bloqueia e ponto.
 */

export type ResultadoAutoEmbarque =
  | { ok: true; eventoId: string; titulo: string; trecho: TrechoEmbarque; alerta: boolean }
  | { ok: false; codigo: string; motivo: string }

/**
 * Coordenada do aparelho no embarque. **Opcional e nunca bloqueante**: o
 * cliente manda se conseguir, e permissão negada ou GPS lento seguem em frente
 * — a leitura serve de contexto para o gestor (§ geofence é sinal), não de
 * gate. Por isso o parse silencioso: coordenada inválida vira `null`, não erro
 * na frente do ônibus.
 */
const CoordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export async function confirmarEmbarquePorQr(
  payloadBruto: string,
  coordsBrutas?: { lat: number; lng: number } | null,
): Promise<ResultadoAutoEmbarque> {
  const coords = coordsBrutas ? (CoordsSchema.safeParse(coordsBrutas).data ?? null) : null
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, codigo: 'SEM_SESSAO', motivo: 'Entre na sua conta para confirmar.' }
  }
  const userId = session.user.id

  const dados = lerQrEmbarque(extrairPayloadDeQr(payloadBruto))
  if (!dados) {
    return { ok: false, codigo: 'QR_INVALIDO', motivo: 'QR inválido ou adulterado.' }
  }

  const evento: {
    id: string
    tenantId: string
    tipo: string
    titulo: string
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
    embarqueTrechoAtivo: TrechoEmbarque | null
  } | null = await db.evento.findUnique({
    where: { id: dados.eventoId },
    select: {
      id: true,
      tenantId: true,
      tipo: true,
      titulo: true,
      valorVaga: true,
      checkInExigePagamento: true,
      embarqueTrechoAtivo: true,
    },
  })
  if (!evento) {
    return { ok: false, codigo: 'EVENTO_NAO_ENCONTRADO', motivo: 'Evento não encontrado.' }
  }

  try {
    await assertMembroAtivo(evento.tenantId, userId)
  } catch (e) {
    return {
      ok: false,
      codigo: 'SEM_VINCULO',
      motivo: e instanceof Error ? e.message : 'Você não tem vínculo ativo com esta torcida.',
    }
  }

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  const [rsvp, jaExiste] = await Promise.all([
    db.eventoRsvp.findUnique({
      where: { eventoId_userId: { eventoId: evento.id, userId } },
      select: { status: true, checkedInAt: true },
    }) as Promise<{ status: string; checkedInAt: Date | null } | null>,
    db.eventoCheckin.findUnique({
      where: {
        eventoId_userId_trecho: { eventoId: evento.id, userId, trecho: dados.trecho },
      },
      select: { id: true },
    }) as Promise<{ id: string } | null>,
  ])

  let cobrancaStatus: string | null = null
  if (evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)) {
    const cobrancas = await carregarCobrancasVagaEvento(evento.tenantId, evento.id)
    cobrancaStatus = cobrancas[userId] ?? null
  }

  const decisao = podeAutoEmbarcar({
    trechoAtivo: evento.embarqueTrechoAtivo,
    trechoDoToken: dados.trecho,
    janelaValida: janelaEmbarqueValida(dados.janela),
    rsvpStatus: rsvp?.status ?? null,
    jaEmbarcado: jaExiste != null,
    valorVaga: valorVagaNum,
    cobrancaStatus,
    checkInExigePagamento: evento.checkInExigePagamento,
  })

  if (!decisao.ok) {
    return { ok: false, codigo: decisao.codigo, motivo: decisao.motivo }
  }

  const materializaPresenca = dados.trecho === 'IDA'

  await gravarCheckinEmbarque({
    eventoId: evento.id,
    userId,
    trecho: dados.trecho,
    metodo: 'QR_EVENTO',
    registradoPorId: null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  })

  if (materializaPresenca && !rsvp?.checkedInAt) {
    const rsvpRow: { id: string } = await db.eventoRsvp.update({
      where: { eventoId_userId: { eventoId: evento.id, userId } },
      data: { checkedInAt: new Date(), checkedInPorId: userId },
      select: { id: true },
    })
    registrarSinalConfiancaSafe({
      userId,
      tenantId: evento.tenantId,
      sinal: 'CHECKIN',
      origemId: rsvpRow.id,
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: evento.tenantId,
      atorId: userId,
      acao: 'EVENTO_EMBARQUE_AUTO',
      entidade: 'EventoCheckin',
      entidadeId: evento.id,
      detalhes: {
        userId,
        trecho: dados.trecho,
        cobrancaStatus,
        alerta: decisao.alerta,
        comCoordenada: coords != null,
      },
    },
  })

  revalidatePath(`/admin/eventos/${evento.id}`)
  revalidatePath(`/portal/eventos/${evento.id}`)

  return {
    ok: true,
    eventoId: evento.id,
    titulo: evento.titulo,
    trecho: dados.trecho,
    alerta: decisao.alerta,
  }
}
