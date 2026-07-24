'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'
import { assertMembroAtivo } from '@/lib/authz'
import { revalidatePath } from 'next/cache'
import { capacidadeEfetiva, lotacaoCheia } from '@/lib/eventos-capacidade'
import { notificarSafe } from '@/lib/notificacoes'
import { promoverProximoDaEspera } from '@/lib/eventos-waitlist'
import type { RsvpStatus } from '@torcida/db'

export type RsvpResult =
  | { ok: true; status: RsvpStatus }
  | { ok: false; error: string; status?: RsvpStatus }

export async function responderRsvp(
  eventoId: string,
  status: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA',
): Promise<RsvpResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Não autenticado' }
  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) return { ok: false, error: 'Tenant não encontrado' }

  await assertMembroAtivo(tenant.id, session.user.id)

  const evento = await db.evento.findUnique({
    where: { id: eventoId },
    select: {
      tenantId: true,
      data: true,
      titulo: true,
      criadoPorId: true,
      capacidade: true,
      sede: { select: { capacidade: true } },
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })

  if (!evento || evento.tenantId !== tenant.id) {
    return { ok: false, error: 'Evento não encontrado' }
  }
  if (new Date(evento.data) < new Date()) {
    return { ok: false, error: 'Evento já encerrado' }
  }

  const atual = await db.eventoRsvp.findUnique({
    where: { eventoId_userId: { eventoId, userId: session.user.id } },
    select: { status: true },
  })

  let statusFinal: RsvpStatus = status

  if (status === 'CONFIRMADO') {
    const cap = capacidadeEfetiva(evento)
    const jaConfirmado = atual?.status === 'CONFIRMADO'
    if (!jaConfirmado && lotacaoCheia(evento._count.rsvps, cap)) {
      statusFinal = 'LISTA_ESPERA'
    }
  }

  await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId: session.user.id } },
    update: { status: statusFinal },
    create: { eventoId, userId: session.user.id, status: statusFinal },
  })

  // Liberou vaga → promove o próximo da fila
  if (atual?.status === 'CONFIRMADO' && statusFinal !== 'CONFIRMADO') {
    await promoverProximoDaEspera(eventoId)
  }

  if (
    evento.criadoPorId &&
    evento.criadoPorId !== session.user.id &&
    statusFinal === 'CONFIRMADO'
  ) {
    await notificarSafe({
      userId: evento.criadoPorId,
      tenantId: tenant.id,
      tipo: 'EVENTO_RSVP',
      titulo: 'Nova confirmação',
      corpo: `Alguém confirmou presença em “${evento.titulo}”.`,
      link: `/admin/eventos/${eventoId}`,
      atorId: session.user.id,
    })
  }

  revalidatePath(`/portal/eventos/${eventoId}`)
  revalidatePath('/portal/eventos')
  revalidatePath('/portal/caravanas')
  revalidatePath('/portal/bateria')
  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath('/portal')

  return { ok: true, status: statusFinal }
}
