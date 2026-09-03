'use server'

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  CriarEventoSchema,
  PERMISSIONS,
  resolverStatusVaga,
  temValorVaga,
  deveBloquearCheckInSemPagamento,
} from '@torcida/types'
import type { TrechoEmbarque } from '@torcida/db'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import {
  contarEmbarquePorTrecho,
  gravarCheckinEmbarque,
  resolverTrechoParaRegistro,
} from '@/lib/embarque'
import { montarQrEmbarque } from '@/lib/embarque-qr'
import { listarOcorrenciasFuturasSerie, parseEscopoSerie } from '@/lib/eventos-serie'
import { resolvePartidaIdFromForm } from '@/app/admin/partidas/actions'
import { carregarCobrancasVagaEvento } from '@/lib/eventos-tipo'
import { notificarInscritosEvento, notificarCheckInEvento } from '@/lib/eventos-notificacoes'
import { linksEventoParaReconciliar } from '@/lib/eventos-admin-href'
import { reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { registrarSinalConfiancaSafe } from '@/lib/confianca'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { parseDonoValor, type DonoOperacional } from '@/lib/evento-dono'

export type EventoState = {
  ok?: boolean
  errors?: Record<string, string[]>
  message?: string
}

function revalidateEventoPaths(tenantId: string, eventoId?: string, tipo?: string) {
  revalidateDirecao(tenantId)
  revalidatePath('/admin/eventos')
  revalidatePath('/portal/eventos')
  revalidatePath('/portal/caravanas')
  revalidatePath('/portal/bateria')
  revalidatePath('/portal/departamentos', 'layout')
  if (eventoId) {
    revalidatePath(`/admin/eventos/${eventoId}`)
    revalidatePath(`/portal/eventos/${eventoId}`)
    revalidatePath(`/portal/caravanas/${eventoId}`)
    revalidatePath(`/portal/bateria/${eventoId}`)
  }
  if (tipo === 'CARAVANA') revalidatePath('/portal/departamentos/caravanas')
  if (tipo === 'ENSAIO') revalidatePath('/portal/departamentos/bateria')
}

/**
 * Posto de comando de quem depende deste evento (Caravanas, Bateria, Social…)
 * conta pendências em cache curto — sem isto, criar/mexer num evento só
 * aparece no hub vizinho depois do TTL.
 */
function revalidateDirecao(tenantId: string) {
  invalidateAdminDirecao(tenantId)
}

function formToEvento(formData: FormData) {
  return {
    titulo: formData.get('titulo'),
    descricao: formData.get('descricao') || undefined,
    data: formData.get('data'),
    local: formData.get('local') || undefined,
    fotoUrl: formData.get('fotoUrl') || undefined,
    tipo: formData.get('tipo') || 'GERAL',
    sedeId: formData.get('sedeId') || null,
    valorVaga: formData.get('valorVaga') || undefined,
    capacidade: formData.get('capacidade') || undefined,
    lat: formData.get('lat') || undefined,
    lng: formData.get('lng') || undefined,
    recorrenciasSemanas: formData.get('recorrenciasSemanas') || 0,
    partidaId: formData.get('partidaId') || null,
    projetoId: formData.get('projetoId') || undefined,
    donoOperacional: formData.get('donoOperacional') || undefined,
    departamentoSlug: formData.get('departamentoSlug') || undefined,
    checkInExigePagamento: formData.get('checkInExigePagamento'),
  }
}

/**
 * Projeto do evento: pertence ao tenant. Sem id = sem vínculo (null).
 * Espelha o cuidado de `resolverRateio` no financeiro.
 */
async function resolverProjetoEvento(
  tenantId: string,
  projetoId: string | undefined,
): Promise<
  | { projetoId: string | null; departamentoId: string | null; areaId: string | null }
  | { erro: string }
> {
  if (!projetoId) return { projetoId: null, departamentoId: null, areaId: null }
  const projeto: { id: string; departamentoId: string; areaId: string | null } | null =
    await db.projeto.findFirst({
      where: { id: projetoId, tenantId },
      select: { id: true, departamentoId: true, areaId: true },
    })
  if (!projeto) return { erro: 'Projeto não encontrado nesta torcida' }
  return {
    projetoId: projeto.id,
    departamentoId: projeto.departamentoId,
    areaId: projeto.areaId,
  }
}

/**
 * Dono operacional do evento, na ordem em que a informação é mais confiável:
 * escolha explícita no formulário → hub thin de onde a criação partiu →
 * herança do projeto. Sem nada disso, o evento é da torcida (nulo).
 *
 * Valida contra o tenant como `resolverProjetoEvento`: departamento tem de ser
 * daqui, e a área tem de ser daquele departamento — senão a frente de um
 * departamento apareceria pendurada em outro.
 */
async function resolverDonoEvento(
  tenantId: string,
  input: {
    donoOperacional?: string
    departamentoSlug?: string
    heranca: { departamentoId: string | null; areaId: string | null }
  },
): Promise<DonoOperacional | { erro: string }> {
  const escolhido = parseDonoValor(input.donoOperacional)

  let departamentoId = escolhido.departamentoId
  let areaId = escolhido.areaId

  if (!departamentoId && input.departamentoSlug) {
    const doHub: { id: string } | null = await db.departamento.findFirst({
      where: { tenantId, slug: input.departamentoSlug },
      select: { id: true },
    })
    if (doHub) departamentoId = doHub.id
  }

  if (!departamentoId) {
    departamentoId = input.heranca.departamentoId
    areaId = input.heranca.areaId
  }

  if (!departamentoId) return { departamentoId: null, areaId: null }

  const depto: { id: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId },
    select: { id: true },
  })
  if (!depto) return { erro: 'Departamento não encontrado nesta torcida' }

  if (areaId) {
    const area: { id: string } | null = await db.departamentoArea.findFirst({
      where: { id: areaId, tenantId, departamentoId: depto.id },
      select: { id: true },
    })
    if (!area) return { erro: 'Área não pertence a este departamento' }
  }

  return { departamentoId: depto.id, areaId: areaId ?? null }
}

export async function criarEvento(
  _prev: EventoState,
  formData: FormData,
): Promise<EventoState> {
  const { session, tenant } = await assertAnyPermission([
    PERMISSIONS.EVENTS_CREATE,
    PERMISSIONS.EVENTS_MANAGE,
  ])

  const parsed = CriarEventoSchema.safeParse(formToEvento(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const {
    titulo,
    descricao,
    data,
    local,
    fotoUrl,
    tipo,
    valorVaga,
    sedeId,
    capacidade,
    lat,
    lng,
    recorrenciasSemanas,
    projetoId: projetoIdRaw,
    donoOperacional,
    departamentoSlug,
    checkInExigePagamento,
  } = parsed.data
  const dataComp = new Date(data)
  if (Number.isNaN(dataComp.getTime())) {
    return { errors: { data: ['Data inválida'] } }
  }

  if (sedeId) {
    const sede = await db.sede.findFirst({
      where: { id: sedeId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!sede) return { errors: { sedeId: ['Sede inválida'] } }
  }

  const projetoRes = await resolverProjetoEvento(tenant.id, projetoIdRaw)
  if ('erro' in projetoRes) return { errors: { projetoId: [projetoRes.erro] } }
  const projetoId = projetoRes.projetoId

  const donoRes = await resolverDonoEvento(tenant.id, {
    donoOperacional,
    departamentoSlug,
    heranca: { departamentoId: projetoRes.departamentoId, areaId: projetoRes.areaId },
  })
  if ('erro' in donoRes) return { errors: { donoOperacional: [donoRes.erro] } }
  const { departamentoId, areaId } = donoRes

  const partidaRes = await resolvePartidaIdFromForm(tenant.id, formData)
  if (partidaRes.error?.errors) return { errors: partidaRes.error.errors }
  const partidaId = partidaRes.partidaId

  const semanasExtras = recorrenciasSemanas ?? 0
  const datas: Date[] = [dataComp]
  for (let i = 1; i <= semanasExtras; i++) {
    const d = new Date(dataComp)
    d.setDate(d.getDate() + i * 7)
    datas.push(d)
  }
  const serieId = semanasExtras > 0 ? randomUUID() : null

  const valorVagaFinal = tipo === 'CARAVANA' && valorVaga != null ? valorVaga : null
  const baseData = {
    tenantId: tenant.id,
    tipo,
    titulo,
    descricao: descricao ?? null,
    fotoUrl: fotoUrl ?? null,
    local: local ?? null,
    sedeId: sedeId ?? null,
    capacidade: capacidade ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    serieId,
    partidaId,
    projetoId,
    departamentoId,
    areaId,
    valorVaga: valorVagaFinal,
    checkInExigePagamento:
      tipo === 'CARAVANA' && valorVagaFinal != null && Boolean(checkInExigePagamento),
    criadoPorId: session.user.id,
  }

  const criados: Array<{ id: string; tipo: string }> = []
  for (const dataOcorrencia of datas) {
    const evento = await db.evento.create({
      data: { ...baseData, data: dataOcorrencia },
      select: { id: true, tipo: true },
    })
    criados.push(evento)
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'EVENTO_CRIADO',
        entidade: 'Evento',
        entidadeId: evento.id,
        detalhes: {
          tipo: evento.tipo,
          sedeId: sedeId ?? null,
          serieId,
          partidaId,
          projetoId,
          departamentoId,
          areaId,
          serie: serieId ? { indice: criados.length, total: datas.length } : null,
        },
      },
    })
  }

  const primeiro = criados[0]!
  revalidateEventoPaths(tenant.id, primeiro.id, primeiro.tipo)
  const redirectTo = formData.get('redirectTo')
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/admin')) {
    redirect(`/admin/eventos/${primeiro.id}`)
  }
  redirect(`/portal/eventos/${primeiro.id}`)
}

export async function editarEvento(
  eventoId: string,
  _prev: EventoState,
  formData: FormData,
): Promise<EventoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const parsed = CriarEventoSchema.safeParse(formToEvento(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const {
    titulo,
    descricao,
    data,
    local,
    fotoUrl,
    tipo,
    valorVaga,
    sedeId,
    capacidade,
    lat,
    lng,
    projetoId: projetoIdRaw,
    donoOperacional,
    departamentoSlug,
    checkInExigePagamento,
  } = parsed.data
  const dataComp = new Date(data)
  if (Number.isNaN(dataComp.getTime())) {
    return { errors: { data: ['Data inválida'] } }
  }

  const existing: {
    id: string
    tenantId: string
    data: Date
    local: string | null
    titulo: string
    serieId: string | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true, data: true, local: true, titulo: true, serieId: true },
  })

  if (!existing || existing.tenantId !== tenant.id) {
    return { message: 'Evento não encontrado.' }
  }

  if (sedeId) {
    const sede = await db.sede.findFirst({
      where: { id: sedeId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!sede) return { errors: { sedeId: ['Sede inválida'] } }
  }

  const projetoRes = await resolverProjetoEvento(tenant.id, projetoIdRaw)
  if ('erro' in projetoRes) return { errors: { projetoId: [projetoRes.erro] } }
  const projetoId = projetoRes.projetoId

  const donoRes = await resolverDonoEvento(tenant.id, {
    donoOperacional,
    departamentoSlug,
    heranca: { departamentoId: projetoRes.departamentoId, areaId: projetoRes.areaId },
  })
  if ('erro' in donoRes) return { errors: { donoOperacional: [donoRes.erro] } }
  const { departamentoId, areaId } = donoRes

  const partidaRes = await resolvePartidaIdFromForm(tenant.id, formData)
  if (partidaRes.error?.errors) return { errors: partidaRes.error.errors }
  const partidaId = partidaRes.partidaId

  const escopo = parseEscopoSerie(formData.get('escopoSerie'))
  const valorVagaFinal = tipo === 'CARAVANA' && valorVaga != null ? valorVaga : null
  const patchBase = {
    titulo,
    descricao: descricao ?? null,
    fotoUrl: fotoUrl ?? null,
    local: local ?? null,
    tipo,
    sedeId: sedeId ?? null,
    capacidade: capacidade ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    partidaId,
    projetoId,
    departamentoId,
    areaId,
    valorVaga: valorVagaFinal,
    checkInExigePagamento:
      tipo === 'CARAVANA' && valorVagaFinal != null && Boolean(checkInExigePagamento),
  }

  let afetados = 1
  let idsAfetados: string[] = [existing.id]
  if (escopo === 'futuras' && existing.serieId) {
    const ocorrencias = await listarOcorrenciasFuturasSerie({
      tenantId: tenant.id,
      serieId: existing.serieId,
      aPartirDe: existing.data,
    })
    const deltaMs = dataComp.getTime() - existing.data.getTime()
    for (const oc of ocorrencias) {
      await db.evento.update({
        where: { id: oc.id },
        data: {
          ...patchBase,
          data: oc.id === existing.id ? dataComp : new Date(oc.data.getTime() + deltaMs),
        },
      })
    }
    afetados = ocorrencias.length
    idsAfetados = ocorrencias.map((o) => o.id)
  } else {
    await db.evento.update({
      where: { id: existing.id },
      data: { ...patchBase, data: dataComp },
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EDITADO',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: {
        tipo,
        sedeId: sedeId ?? null,
        escopoSerie: escopo,
        serieId: existing.serieId,
        partidaId,
        projetoId,
        departamentoId,
        areaId,
        afetados,
      },
    },
  })

  const dataMudou = existing.data.getTime() !== dataComp.getTime()
  const localMudou = (existing.local ?? '') !== (local ?? '')
  if (dataMudou || localMudou) {
    const quando = dataComp.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    await notificarInscritosEvento({
      tenantId: tenant.id,
      eventoIds: idsAfetados,
      tipo: 'EVENTO_ALTERADO',
      titulo: `Evento alterado: ${titulo}`,
      corpo: dataMudou
        ? `Nova data: ${quando}${local ? ` · ${local}` : ''}.`
        : `Novo local: ${local ?? 'a definir'}.`,
      link: `/portal/eventos/${eventoId}`,
      atorId: session.user.id,
      excetoUserId: session.user.id,
    })
  }

  const redirectTo = formData.get('redirectTo')
  revalidateEventoPaths(tenant.id, eventoId, tipo)
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/')) {
    redirect(redirectTo)
  }
  redirect(`/admin/eventos/${eventoId}`)
}

/**
 * Check-in real — independente do RSVP. Em caravana com `valorVaga`, cruza a
 * cobrança AVULSA. Default: avisa e permite. Com `checkInExigePagamento`:
 * bloqueia sem PAGO, salvo `override` do gestor.
 */
export async function registrarCheckIn(
  eventoId: string,
  userId: string,
  opts?: { override?: boolean },
): Promise<{ ok: true; aviso?: string } | { ok: false; error: string; bloqueado?: boolean }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const evento: {
    tenantId: string
    tipo: string
    titulo: string
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
    embarqueTrechoAtivo: TrechoEmbarque | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      tipo: true,
      titulo: true,
      valorVaga: true,
      checkInExigePagamento: true,
      embarqueTrechoAtivo: true,
    },
  })
  if (!evento || evento.tenantId !== tenant.id) throw new Error('Evento não encontrado.')

  const { trecho, materializaPresenca } = resolverTrechoParaRegistro(evento.embarqueTrechoAtivo)

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  let pagamentoStatus: string | null = null
  let aviso: string | undefined
  if (evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)) {
    const cobrancas = await carregarCobrancasVagaEvento(tenant.id, eventoId)
    pagamentoStatus = cobrancas[userId] ?? null
    const status = resolverStatusVaga({
      valorVaga: valorVagaNum,
      cobrancaStatus: pagamentoStatus,
    })
    if (
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: evento.checkInExigePagamento,
        valorVaga: valorVagaNum,
        alerta: status.alerta,
        override: opts?.override,
      })
    ) {
      return {
        ok: false,
        bloqueado: true,
        error: `Vaga ${status.labelPagamento.toLowerCase()}. Pague antes ou use “Embarcar mesmo assim”.`,
      }
    }
    if (status.alerta) {
      aviso = opts?.override
        ? `Override — vaga ${status.labelPagamento.toLowerCase()}.`
        : `Check-in ok — vaga ${status.labelPagamento.toLowerCase()}.`
    }
  }

  const rsvpAtual: { checkedInAt: Date | null } | null = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId } },
    select: { checkedInAt: true },
  })
  const jaEmbarcado = Boolean(rsvpAtual?.checkedInAt)

  const rsvpCheckin: { id: string } = await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId } },
    update: materializaPresenca
      ? { checkedInAt: new Date(), checkedInPorId: session.user.id }
      : {},
    create: {
      eventoId,
      userId,
      status: 'CONFIRMADO',
      checkedInAt: materializaPresenca ? new Date() : null,
      checkedInPorId: materializaPresenca ? session.user.id : null,
    },
    select: { id: true },
  })

  await gravarCheckinEmbarque({
    eventoId,
    userId,
    trecho,
    metodo: 'MANUAL',
    registradoPorId: session.user.id,
    override: Boolean(opts?.override),
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_CHECKIN',
      entidade: 'EventoRsvp',
      entidadeId: eventoId,
      detalhes: {
        userId,
        trecho,
        pagamentoStatus,
        aviso: aviso ?? null,
        override: Boolean(opts?.override),
      },
    },
  })

  // Confiança e notificação seguem colados na IDA: a volta é o mesmo
  // comparecimento, contá-la de novo pagaria duas vezes pelo mesmo jogo.
  if (materializaPresenca) {
    registrarSinalConfiancaSafe({
      userId,
      tenantId: tenant.id,
      sinal: 'CHECKIN',
      origemId: rsvpCheckin.id,
    })
  }
  if (!jaEmbarcado && materializaPresenca) {
    await notificarCheckInEvento({
      tenantId: tenant.id,
      eventoId,
      titulo: evento.titulo,
      userId,
      atorId: session.user.id,
    })
  }

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  return aviso ? { ok: true, aviso } : { ok: true }
}

/**
 * Check-in via QR da carteirinha (mesmo token de `/carteirinha/validar`).
 * Exige carteirinha válida + adimplente; faz upsert de RSVP CONFIRMADO.
 * Em caravana paga, anexa aviso se a vaga não estiver paga (não bloqueia).
 */
export async function registrarCheckInPorQr(
  eventoId: string,
  payloadRaw: string,
): Promise<{ ok: true; nome: string; aviso?: string } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const payload = payloadRaw.includes('t=')
    ? (new URL(payloadRaw, 'https://local.invalid').searchParams.get('t') ?? payloadRaw)
    : payloadRaw

  const { validarCarteirinhaPorPayload } = await import('@/lib/carteirinha-qr')
  const validacao = await validarCarteirinhaPorPayload(payload)
  if (!validacao.ok) {
    return { ok: false, error: validacao.motivo ?? 'QR inválido' }
  }

  type SocioLite = { userId: string; nome: string; tenantId: string }
  const { parsePayloadQr } = await import('@/lib/carteirinha-qr')
  const token = parsePayloadQr(payload)
  if (!token) return { ok: false, error: 'QR inválido' }

  const socio: SocioLite | null = await db.saasSocio.findFirst({
    where: { qrToken: token, tenantId: tenant.id },
    select: { userId: true, nome: true, tenantId: true },
  })
  if (!socio) return { ok: false, error: 'Carteirinha de outra torcida' }

  const evento: {
    tenantId: string
    tipo: string
    titulo: string
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
    embarqueTrechoAtivo: TrechoEmbarque | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      tipo: true,
      titulo: true,
      valorVaga: true,
      checkInExigePagamento: true,
      embarqueTrechoAtivo: true,
    },
  })
  if (!evento || evento.tenantId !== tenant.id) {
    return { ok: false, error: 'Evento não encontrado' }
  }

  const { trecho, materializaPresenca } = resolverTrechoParaRegistro(evento.embarqueTrechoAtivo)

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  let pagamentoStatus: string | null = null
  let aviso: string | undefined
  if (evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)) {
    const cobrancas = await carregarCobrancasVagaEvento(tenant.id, eventoId)
    pagamentoStatus = cobrancas[socio.userId] ?? null
    const status = resolverStatusVaga({
      valorVaga: valorVagaNum,
      cobrancaStatus: pagamentoStatus,
    })
    if (
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: evento.checkInExigePagamento,
        valorVaga: valorVagaNum,
        alerta: status.alerta,
      })
    ) {
      return {
        ok: false,
        error: `Vaga ${status.labelPagamento.toLowerCase()}. Regularize o pagamento ou faça check-in manual com override.`,
      }
    }
    if (status.alerta) {
      aviso = `Vaga ${status.labelPagamento.toLowerCase()}.`
    }
  }

  const rsvpQr: { checkedInAt: Date | null } | null = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId: socio.userId } },
    select: { checkedInAt: true },
  })
  const jaEmbarcadoQr = Boolean(rsvpQr?.checkedInAt)

  const rsvpQrRow: { id: string } = await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId: socio.userId } },
    update: materializaPresenca
      ? { checkedInAt: new Date(), checkedInPorId: session.user.id, status: 'CONFIRMADO' }
      : { status: 'CONFIRMADO' },
    create: {
      eventoId,
      userId: socio.userId,
      status: 'CONFIRMADO',
      checkedInAt: materializaPresenca ? new Date() : null,
      checkedInPorId: materializaPresenca ? session.user.id : null,
    },
    select: { id: true },
  })

  await gravarCheckinEmbarque({
    eventoId,
    userId: socio.userId,
    trecho,
    metodo: 'QR_CARTEIRINHA',
    registradoPorId: session.user.id,
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_CHECKIN_QR',
      entidade: 'EventoRsvp',
      entidadeId: eventoId,
      detalhes: {
        userId: socio.userId,
        nome: socio.nome,
        trecho,
        pagamentoStatus,
        aviso: aviso ?? null,
      },
    },
  })

  if (materializaPresenca) {
    registrarSinalConfiancaSafe({
      userId: socio.userId,
      tenantId: tenant.id,
      sinal: 'CHECKIN',
      origemId: rsvpQrRow.id,
    })
  }
  if (!jaEmbarcadoQr && materializaPresenca) {
    await notificarCheckInEvento({
      tenantId: tenant.id,
      eventoId,
      titulo: evento.titulo,
      userId: socio.userId,
      atorId: session.user.id,
    })
  }

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  return aviso ? { ok: true, nome: socio.nome, aviso } : { ok: true, nome: socio.nome }
}

const TrechoEmbarqueSchema = z.enum(['IDA', 'VOLTA'])

/** Estado que o painel de embarque do gestor consome a cada ciclo. */
export type EstadoPainelEmbarque = {
  trechoAtivo: TrechoEmbarque | null
  abertoEm: string | null
  qr: { payload: string; expiraEm: number; janelaSegundos: number } | null
  contagem: Record<TrechoEmbarque, number>
  confirmados: number
}

async function carregarEstadoPainel(
  eventoId: string,
  tenantId: string,
): Promise<EstadoPainelEmbarque> {
  const evento: {
    embarqueTrechoAtivo: TrechoEmbarque | null
    embarqueAbertoEm: Date | null
  } | null = await db.evento.findFirst({
    where: { id: eventoId, tenantId },
    select: { embarqueTrechoAtivo: true, embarqueAbertoEm: true },
  })
  if (!evento) throw new Error('Evento não encontrado.')

  const [contagem, confirmados] = await Promise.all([
    contarEmbarquePorTrecho(eventoId),
    db.eventoRsvp.count({ where: { eventoId, status: 'CONFIRMADO' } }),
  ])

  return {
    trechoAtivo: evento.embarqueTrechoAtivo,
    abertoEm: evento.embarqueAbertoEm?.toISOString() ?? null,
    qr: evento.embarqueTrechoAtivo ? montarQrEmbarque(eventoId, evento.embarqueTrechoAtivo) : null,
    contagem,
    confirmados,
  }
}

/**
 * Estado do painel + QR da janela atual.
 *
 * O QR é **derivado do relógio**, não guardado: cada chamada devolve o código
 * válido agora e o instante em que ele vira. O painel repete a chamada porque
 * o código expira, não porque algo mudou no banco.
 */
export async function obterEstadoPainelEmbarque(eventoId: string): Promise<EstadoPainelEmbarque> {
  const { tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  return carregarEstadoPainel(eventoId, tenant.id)
}

/**
 * Abre a porta do ônibus para um trecho. Enquanto não houver trecho aberto, o
 * QR do evento não existe e ninguém consegue se auto-embarcar — é o que
 * impede alguém de "embarcar" três dias antes da viagem.
 *
 * Abrir um trecho fecha o outro: não se embarca a ida e a volta ao mesmo
 * tempo, e deixar os dois abertos faria o contador do painel mentir.
 */
export async function abrirEmbarque(
  eventoId: string,
  trechoRaw: string,
): Promise<{ ok: true; estado: EstadoPainelEmbarque } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const parsed = TrechoEmbarqueSchema.safeParse(trechoRaw)
  if (!parsed.success) return { ok: false, error: 'Trecho inválido.' }
  const trecho = parsed.data

  const evento: { id: string; tipo: string } | null = await db.evento.findFirst({
    where: { id: eventoId, tenantId: tenant.id },
    select: { id: true, tipo: true },
  })
  if (!evento) return { ok: false, error: 'Evento não encontrado.' }

  await db.evento.update({
    where: { id: eventoId },
    data: {
      embarqueTrechoAtivo: trecho,
      embarqueAbertoEm: new Date(),
      embarqueAbertoPorId: session.user.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EMBARQUE_ABRIR',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: { trecho },
    },
  })

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  return { ok: true, estado: await carregarEstadoPainel(eventoId, tenant.id) }
}

/**
 * Encerra o embarque em curso — o botão que responde "posso ir embora?".
 * A partir daqui o QR para de valer e quem ficou para trás só entra por
 * check-in manual.
 */
export async function encerrarEmbarque(
  eventoId: string,
): Promise<{ ok: true; estado: EstadoPainelEmbarque } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const evento: { id: string; tipo: string; embarqueTrechoAtivo: TrechoEmbarque | null } | null =
    await db.evento.findFirst({
      where: { id: eventoId, tenantId: tenant.id },
      select: { id: true, tipo: true, embarqueTrechoAtivo: true },
    })
  if (!evento) return { ok: false, error: 'Evento não encontrado.' }
  if (!evento.embarqueTrechoAtivo) {
    return { ok: false, error: 'Não há embarque aberto neste evento.' }
  }

  await db.evento.update({
    where: { id: eventoId },
    data: { embarqueTrechoAtivo: null, embarqueAbertoEm: null, embarqueAbertoPorId: null },
  })

  const contagem = await contarEmbarquePorTrecho(eventoId)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EMBARQUE_ENCERRAR',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: {
        trecho: evento.embarqueTrechoAtivo,
        embarcados: contagem[evento.embarqueTrechoAtivo],
      },
    },
  })

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  return { ok: true, estado: await carregarEstadoPainel(eventoId, tenant.id) }
}

export async function promoverDaListaEspera(
  eventoId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const evento = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      tipo: true,
      capacidade: true,
      valorVaga: true,
      sede: { select: { capacidade: true } },
    },
  })
  if (!evento || evento.tenantId !== tenant.id) {
    return { ok: false, error: 'Evento não encontrado' }
  }

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  const { capacidadeEfetiva, lotacaoCheia, contarOcupacaoEvento } = await import(
    '@/lib/eventos-capacidade'
  )
  const cap = capacidadeEfetiva(evento)
  const ocupados = await contarOcupacaoEvento({
    tenantId: tenant.id,
    eventoId,
    valorVaga: valorVagaNum,
  })
  if (lotacaoCheia(ocupados, cap)) {
    return { ok: false, error: 'Lotação esgotada' }
  }

  const rsvp = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId } },
    select: { status: true },
  })
  if (!rsvp || rsvp.status !== 'LISTA_ESPERA') {
    return { ok: false, error: 'Membro não está na lista de espera' }
  }

  await db.eventoRsvp.update({
    where: { eventoId_userId: { eventoId, userId } },
    data: { status: 'CONFIRMADO' },
  })

  if (evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)) {
    const { garantirCobrancaVagaCaravana } = await import('@/lib/caravana-vaga')
    await garantirCobrancaVagaCaravana({
      tenantId: tenant.id,
      userId,
      eventoId,
      notificar: true,
    })
  }
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_PROMOVER_ESPERA',
      entidade: 'EventoRsvp',
      entidadeId: eventoId,
      detalhes: { userId },
    },
  })

  const { notificarSafe } = await import('@/lib/notificacoes')
  await notificarSafe({
    userId,
    tenantId: tenant.id,
    tipo: 'EVENTO_RSVP',
    titulo: 'Vaga liberada',
    corpo: temValorVaga(valorVagaNum)
      ? 'Você saiu da lista de espera. Pague a cobrança da vaga para garantir o lugar.'
      : 'Você saiu da lista de espera e está confirmado no evento.',
    link: `/portal/eventos/${eventoId}`,
    atorId: session.user.id,
  })

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  return { ok: true }
}

export async function excluirEvento(
  eventoId: string,
  escopo: 'esta' | 'futuras' = 'esta',
) {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const existing: {
    id: string
    tenantId: string
    tipo: string
    titulo: string
    data: Date
    serieId: string | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true, tipo: true, titulo: true, data: true, serieId: true },
  })

  if (!existing || existing.tenantId !== tenant.id) {
    throw new Error('Evento não encontrado.')
  }

  let idsExcluidos: string[] = [existing.id]
  if (escopo === 'futuras' && existing.serieId) {
    const ocorrencias = await listarOcorrenciasFuturasSerie({
      tenantId: tenant.id,
      serieId: existing.serieId,
      aPartirDe: existing.data,
    })
    idsExcluidos = ocorrencias.map((o) => o.id)
  }

  await reconciliarNotificacoesDoEvento(tenant.id, {
    tipos: ['EVENTO_LEMBRETE', 'EVENTO_RSVP', 'EVENTO_DIA_GESTOR', 'EVENTO_CHECKIN'],
    links: idsExcluidos.flatMap((id) => linksEventoParaReconciliar(id)),
  })

  await notificarInscritosEvento({
    tenantId: tenant.id,
    eventoIds: idsExcluidos,
    tipo: 'EVENTO_CANCELADO',
    titulo: `Evento cancelado: ${existing.titulo}`,
    corpo:
      idsExcluidos.length > 1
        ? 'Esta ocorrência e as próximas da série foram canceladas.'
        : 'O evento foi cancelado pela diretoria.',
    link: '/portal/eventos',
    atorId: session.user.id,
    excetoUserId: session.user.id,
  })

  if (escopo === 'futuras' && existing.serieId) {
    await db.evento.deleteMany({
      where: { id: { in: idsExcluidos }, tenantId: tenant.id },
    })
  } else {
    await db.evento.delete({ where: { id: existing.id } })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EXCLUIDO',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: {
        tipo: existing.tipo,
        escopoSerie: escopo,
        serieId: existing.serieId,
        afetados: idsExcluidos.length,
        ids: idsExcluidos,
      },
    },
  })

  revalidateEventoPaths(tenant.id, eventoId, existing.tipo)
}

/**
 * One-click: liga um evento à partida do dia (cluster operacional).
 * Só ids já existentes — sem criar Partida.
 */
export async function vincularEventoAPartida(
  eventoId: string,
  partidaId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  if (!session.user?.id) return { ok: false, message: 'Sessão inválida.' }

  const evento: {
    id: string
    tenantId: string
    tipo: string
    partidaId: string | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true, tipo: true, partidaId: true },
  })
  if (!evento || evento.tenantId !== tenant.id) {
    return { ok: false, message: 'Evento não encontrado.' }
  }

  const tenantRow: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenant.id },
    select: { afiliacaoId: true },
  })
  if (!tenantRow?.afiliacaoId) {
    return { ok: false, message: 'Torcida sem afiliação — não dá para vincular partida.' }
  }

  const partida: { id: string } | null = await db.partida.findFirst({
    where: { id: partidaId, afiliacaoId: tenantRow.afiliacaoId },
    select: { id: true },
  })
  if (!partida) return { ok: false, message: 'Partida inválida.' }

  if (evento.partidaId === partidaId) return { ok: true }

  await db.evento.update({
    where: { id: eventoId },
    data: { partidaId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_PARTIDA_VINCULADA',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: {
        partidaId,
        partidaIdAnterior: evento.partidaId,
        tipo: evento.tipo,
        origem: 'cluster_dia_operacional',
      },
    },
  })

  revalidateEventoPaths(tenant.id, eventoId, evento.tipo)
  revalidatePath('/admin/caravanas')
  revalidatePath('/admin/bateria')
  revalidatePath('/admin/social')
  revalidatePath('/admin/feminino')
  revalidatePath('/admin/carnaval')
  return { ok: true }
}
