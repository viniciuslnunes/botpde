'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { isLiveKitConfigured } from '@/lib/env'
import { createSala, encerrarSala as encerrarSalaNoBanco } from '@/lib/salas'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

const criarSalaSchema = z.object({
  titulo: z.string().min(3, 'Título muito curto').max(120),
  eventoId: z.string().uuid().optional().or(z.literal('')),
})

const enviarMensagemSchema = z.object({
  salaId: z.string().uuid('Sala inválida'),
  conteudo: z.string().min(1, 'Mensagem vazia').max(800),
})

const encerrarSalaSchema = z.object({
  salaId: z.string().uuid('Sala inválida'),
})

export async function criarSala(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEETINGS_HOST)

  if (!isLiveKitConfigured()) {
    throw new Error(
      'Salas de vídeo indisponíveis: configure LIVEKIT_API_KEY, LIVEKIT_API_SECRET e LIVEKIT_URL.',
    )
  }

  const parsed = criarSalaSchema.safeParse({
    titulo: formData.get('titulo'),
    eventoId: formData.get('eventoId'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const eventoId = parsed.data.eventoId || undefined
  if (eventoId) {
    const evento = await db.evento.findFirst({
      where: { id: eventoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!evento) throw new Error('Evento não encontrado para este tenant.')
  }

  const sala = await createSala({
    tenantId: tenant.id,
    hostId: session.user.id,
    titulo: parsed.data.titulo,
    tipo: eventoId ? 'EVENTO' : 'ABERTA',
    eventoId,
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SALA_REUNIAO_CRIADA',
      entidade: 'SalaReuniao',
      entidadeId: sala.id,
      detalhes: { tipo: sala.tipo, eventoId: sala.eventoId },
    },
  })

  revalidatePath('/portal/comunidade/salas')
  revalidatePath('/portal/eventos')
  redirect(`/portal/comunidade/salas/${sala.id}`)
}

export async function encerrarSala(salaId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEETINGS_HOST)
  const parsed = encerrarSalaSchema.safeParse({ salaId })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Sala inválida')

  const sala = await db.salaReuniao.findFirst({
    where: { id: parsed.data.salaId, tenantId: tenant.id },
    select: { id: true, encerradaEm: true },
  })
  if (!sala) throw new Error('Sala não encontrada.')
  if (sala.encerradaEm) return

  const encerrada = await encerrarSalaNoBanco(tenant.id, parsed.data.salaId)
  if (!encerrada) throw new Error('Não foi possível encerrar a sala.')

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SALA_REUNIAO_ENCERRADA',
      entidade: 'SalaReuniao',
      entidadeId: parsed.data.salaId,
    },
  })

  revalidatePath('/portal/comunidade/salas')
  revalidatePath(`/portal/comunidade/salas/${parsed.data.salaId}`)
}

export async function enviarMensagemSala(formData: FormData) {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado.')
  if (!tenant) throw new Error('Tenant não encontrado.')

  const parsed = enviarMensagemSchema.safeParse({
    salaId: formData.get('salaId'),
    conteudo: formData.get('conteudo'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Mensagem inválida')

  await assertMembroAtivo(tenant.id, session.user.id)

  const sala = await db.salaReuniao.findFirst({
    where: { id: parsed.data.salaId, tenantId: tenant.id, encerradaEm: null },
    select: { id: true },
  })
  if (!sala) throw new Error('Sala indisponível.')

  await db.mensagemReuniao.create({
    data: {
      salaId: sala.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
    },
  })

  revalidatePath(`/portal/comunidade/salas/${sala.id}`)
}
