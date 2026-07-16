'use server'

import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CriarEventoSchema, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'

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
    tipo: formData.get('tipo') || 'GERAL',
  }
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

  const { titulo, descricao, data, local, tipo } = parsed.data
  const dataComp = new Date(data)
  if (Number.isNaN(dataComp.getTime())) {
    return { errors: { data: ['Data inválida'] } }
  }

  const redirectTo = formData.get('redirectTo')
  const evento = await db.evento.create({
    data: {
      tenantId: tenant.id,
      tipo,
      titulo,
      descricao: descricao ?? null,
      data: dataComp,
      local: local ?? null,
      criadoPorId: session.user.id,
    },
    select: { id: true, tipo: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_CRIADO',
      entidade: 'Evento',
      entidadeId: evento.id,
      detalhes: { tipo: evento.tipo },
    },
  })

  revalidateEventoPaths(evento.id, evento.tipo)
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/')) {
    redirect(redirectTo)
  }
  redirect('/admin/eventos')
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

  const { titulo, descricao, data, local, tipo } = parsed.data
  const dataComp = new Date(data)
  if (Number.isNaN(dataComp.getTime())) {
    return { errors: { data: ['Data inválida'] } }
  }

  const existing: { id: string; tenantId: string } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { id: true, tenantId: true },
  })

  if (!existing || existing.tenantId !== tenant.id) {
    return { message: 'Evento não encontrado.' }
  }

  await db.evento.update({
    where: { id: existing.id },
    data: {
      titulo,
      descricao: descricao ?? null,
      data: dataComp,
      local: local ?? null,
      tipo,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EDITADO',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: { tipo },
    },
  })

  const redirectTo = formData.get('redirectTo')
  revalidateEventoPaths(eventoId, tipo)
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/')) {
    redirect(redirectTo)
  }
  redirect('/admin/eventos')
}

/**
 * Check-in real — independente do RSVP. Confirmar presença (EventoRsvp.status)
 * não equivale a check-in real: alguém pode confirmar e faltar, ou aparecer
 * sem ter confirmado antes e ser check-in manualmente. Faz upsert porque o
 * usuário pode não ter nenhum EventoRsvp prévio.
 */
export async function registrarCheckIn(eventoId: string, userId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const evento: { tenantId: string; tipo: string } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { tenantId: true, tipo: true },
  })
  if (!evento || evento.tenantId !== tenant.id) throw new Error('Evento não encontrado.')

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
      detalhes: { userId },
    },
  })

  revalidateEventoPaths(eventoId, evento.tipo)
}

/**
 * Check-in via QR da carteirinha (mesmo token de `/carteirinha/validar`).
 * Exige carteirinha válida + adimplente; faz upsert de RSVP CONFIRMADO.
 */
export async function registrarCheckInPorQr(
  eventoId: string,
  payloadRaw: string,
): Promise<{ ok: true; nome: string } | { ok: false; error: string }> {
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

  const evento: { tenantId: string; tipo: string } | null = await db.evento.findUnique({
    where: { id: eventoId },
    select: { tenantId: true, tipo: true },
  })
  if (!evento || evento.tenantId !== tenant.id) {
    return { ok: false, error: 'Evento não encontrado' }
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
      detalhes: { userId: socio.userId, nome: socio.nome },
    },
  })

  revalidateEventoPaths(eventoId, evento.tipo)
  return { ok: true, nome: socio.nome }
}

export async function excluirEvento(eventoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const existing: { id: string; tenantId: string; tipo: string } | null =
    await db.evento.findUnique({
      where: { id: eventoId },
      select: { id: true, tenantId: true, tipo: true },
    })

  if (!existing || existing.tenantId !== tenant.id) {
    throw new Error('Evento não encontrado.')
  }

  await db.evento.delete({ where: { id: existing.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EXCLUIDO',
      entidade: 'Evento',
      entidadeId: eventoId,
      detalhes: { tipo: existing.tipo },
    },
  })

  revalidateEventoPaths(eventoId, existing.tipo)
}
