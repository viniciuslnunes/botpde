'use server'

import { randomUUID } from 'crypto'
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
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { listarOcorrenciasFuturasSerie, parseEscopoSerie } from '@/lib/eventos-serie'
import { resolvePartidaIdFromForm } from '@/app/admin/partidas/actions'
import { carregarCobrancasVagaEvento } from '@/lib/eventos-tipo'

export type EventoState = {
  ok?: boolean
  errors?: Record<string, string[]>
  message?: string
}

function revalidateEventoPaths(eventoId?: string, tipo?: string) {
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
): Promise<{ projetoId: string | null } | { erro: string }> {
  if (!projetoId) return { projetoId: null }
  const projeto: { id: string } | null = await db.projeto.findFirst({
    where: { id: projetoId, tenantId },
    select: { id: true },
  })
  if (!projeto) return { erro: 'Projeto não encontrado nesta torcida' }
  return { projetoId: projeto.id }
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
          serie: serieId ? { indice: criados.length, total: datas.length } : null,
        },
      },
    })
  }

  const primeiro = criados[0]!
  revalidateEventoPaths(primeiro.id, primeiro.tipo)
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

  const { titulo, descricao, data, local, fotoUrl, tipo, valorVaga, sedeId, capacidade, lat, lng, projetoId: projetoIdRaw, checkInExigePagamento } =
    parsed.data
  const dataComp = new Date(data)
  if (Number.isNaN(dataComp.getTime())) {
    return { errors: { data: ['Data inválida'] } }
  }

  const existing: {
    id: string
    tenantId: string
    data: Date
    serieId: string | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true, data: true, serieId: true },
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
    valorVaga: valorVagaFinal,
    checkInExigePagamento:
      tipo === 'CARAVANA' && valorVagaFinal != null && Boolean(checkInExigePagamento),
  }

  let afetados = 1
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
        afetados,
      },
    },
  })

  const redirectTo = formData.get('redirectTo')
  revalidateEventoPaths(eventoId, tipo)
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
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      tipo: true,
      valorVaga: true,
      checkInExigePagamento: true,
    },
  })
  if (!evento || evento.tenantId !== tenant.id) throw new Error('Evento não encontrado.')

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

  await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId } },
    update: { checkedInAt: new Date(), checkedInPorId: session.user.id },
    create: {
      eventoId,
      userId,
      status: 'CONFIRMADO',
      checkedInAt: new Date(),
      checkedInPorId: session.user.id,
    },
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
        pagamentoStatus,
        aviso: aviso ?? null,
        override: Boolean(opts?.override),
      },
    },
  })

  revalidateEventoPaths(eventoId, evento.tipo)
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
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      tipo: true,
      valorVaga: true,
      checkInExigePagamento: true,
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

  await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId: socio.userId } },
    update: { checkedInAt: new Date(), checkedInPorId: session.user.id, status: 'CONFIRMADO' },
    create: {
      eventoId,
      userId: socio.userId,
      status: 'CONFIRMADO',
      checkedInAt: new Date(),
      checkedInPorId: session.user.id,
    },
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
        pagamentoStatus,
        aviso: aviso ?? null,
      },
    },
  })

  revalidateEventoPaths(eventoId, evento.tipo)
  return aviso ? { ok: true, nome: socio.nome, aviso } : { ok: true, nome: socio.nome }
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

  revalidateEventoPaths(eventoId, evento.tipo)
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
    data: Date
    serieId: string | null
  } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true, tipo: true, data: true, serieId: true },
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

  revalidateEventoPaths(eventoId, existing.tipo)
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

  revalidateEventoPaths(eventoId, evento.tipo)
  revalidatePath('/admin/caravanas')
  revalidatePath('/admin/bateria')
  revalidatePath('/admin/social')
  revalidatePath('/admin/feminino')
  revalidatePath('/admin/carnaval')
  return { ok: true }
}
