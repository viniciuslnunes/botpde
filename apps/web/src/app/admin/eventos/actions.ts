'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  const role = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
    },
  })
  if (!role) throw new Error('Sem permissão')
  return { session, tenant }
}

const eventoSchema = z.object({
  titulo: z.string().min(3, 'Título muito curto').max(100),
  descricao: z.string().max(1000).optional().transform((v) => v || undefined),
  data: z.string().min(1, 'Data obrigatória'),
  local: z.string().max(200).optional().transform((v) => v || undefined),
})

export type EventoState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function criarEvento(
  _prev: EventoState,
  formData: FormData,
): Promise<EventoState> {
  const { session, tenant } = await assertAdmin()

  const raw = {
    titulo: formData.get('titulo') as string,
    descricao: formData.get('descricao') as string,
    data: formData.get('data') as string,
    local: formData.get('local') as string,
  }

  const parsed = eventoSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, descricao, data, local } = parsed.data

  const evento = await db.evento.create({
    data: {
      tenantId: tenant.id,
      titulo,
      descricao,
      data: new Date(data),
      local,
      criadoPorId: session.user.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_CRIADO',
      entidade: 'Evento',
      entidadeId: evento.id,
    },
  })

  revalidatePath('/admin/eventos')
  revalidatePath('/portal/eventos')
  redirect('/admin/eventos')
}

export async function editarEvento(
  eventoId: string,
  _prev: EventoState,
  formData: FormData,
): Promise<EventoState> {
  const { session, tenant } = await assertAdmin()

  const raw = {
    titulo: formData.get('titulo') as string,
    descricao: formData.get('descricao') as string,
    data: formData.get('data') as string,
    local: formData.get('local') as string,
  }

  const parsed = eventoSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, descricao, data, local } = parsed.data

  const existing = await db.evento.findUnique({
    where: { id: eventoId },
    select: { tenantId: true },
  })

  if (!existing || existing.tenantId !== tenant.id) {
    return { message: 'Evento não encontrado.' }
  }

  await db.evento.update({
    where: { id: eventoId },
    data: { titulo, descricao, data: new Date(data), local },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EDITADO',
      entidade: 'Evento',
      entidadeId: eventoId,
    },
  })

  revalidatePath('/admin/eventos')
  revalidatePath('/portal/eventos')
  redirect('/admin/eventos')
}

/**
 * Check-in real — independente do RSVP. Confirmar presença (EventoRsvp.status)
 * não equivale a check-in real: alguém pode confirmar e faltar, ou aparecer
 * sem ter confirmado antes e ser check-in manualmente. Faz upsert porque o
 * usuário pode não ter nenhum EventoRsvp prévio.
 */
export async function registrarCheckIn(eventoId: string, userId: string) {
  const { session, tenant } = await assertAdmin()

  const evento = await db.evento.findUnique({ where: { id: eventoId }, select: { tenantId: true } })
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

  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function excluirEvento(eventoId: string) {
  const { session, tenant } = await assertAdmin()

  const existing = await db.evento.findUnique({
    where: { id: eventoId },
    select: { tenantId: true },
  })

  if (!existing || existing.tenantId !== tenant.id) {
    throw new Error('Evento não encontrado.')
  }

  await db.evento.delete({ where: { id: eventoId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_EXCLUIDO',
      entidade: 'Evento',
      entidadeId: eventoId,
    },
  })

  revalidatePath('/admin/eventos')
  revalidatePath('/portal/eventos')
}
