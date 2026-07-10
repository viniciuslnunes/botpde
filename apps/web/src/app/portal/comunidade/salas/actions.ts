'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { isLiveKitConfigured } from '@/lib/env'
import { createSala, encerrarSala as encerrarSalaNoBanco } from '@/lib/salas'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

const criarSalaSchema = z.object({
  titulo: z.string().trim().min(3, 'Título muito curto').max(120),
})

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function parseEventoIdOpcional(formData: FormData): { eventoId?: string; error?: string } {
  const raw = readFormString(formData, 'eventoId').trim()
  if (!raw) return {}
  const parsed = z.string().uuid().safeParse(raw)
  if (!parsed.success) {
    return { error: 'Selecione um evento válido ou deixe "Sem evento vinculado".' }
  }
  return { eventoId: parsed.data }
}

const enviarMensagemSchema = z.object({
  salaId: z.string().uuid('Sala inválida'),
  conteudo: z.string().min(1, 'Mensagem vazia').max(800),
})

const encerrarSalaSchema = z.object({
  salaId: z.string().uuid('Sala inválida'),
})

export type CriarSalaState = { message?: string }

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    String((error as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
  )
}

export async function criarSala(
  _prev: CriarSalaState,
  formData: FormData,
): Promise<CriarSalaState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.MEETINGS_HOST)

    if (!isLiveKitConfigured()) {
      return {
        message:
          'Salas de vídeo indisponíveis: confirme LIVEKIT_API_KEY, LIVEKIT_API_SECRET e LIVEKIT_URL no Railway e faça redeploy.',
      }
    }

    const parsed = criarSalaSchema.safeParse({
      titulo: readFormString(formData, 'titulo'),
    })
    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
    }

    const eventoParsed = parseEventoIdOpcional(formData)
    if (eventoParsed.error) return { message: eventoParsed.error }
    const eventoId = eventoParsed.eventoId
    if (eventoId) {
      const evento = await db.evento.findFirst({
        where: { id: eventoId, tenantId: tenant.id },
        select: { id: true },
      })
      if (!evento) return { message: 'Evento não encontrado para este tenant.' }
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
  } catch (error) {
    if (isNextRedirect(error)) throw error
    const message = error instanceof Error ? error.message : 'Erro ao criar sala'
    return { message }
  }

  return {}
}

/** Form action sem useActionState (ex.: botão em página de evento). */
export async function criarSalaDeEvento(formData: FormData): Promise<void> {
  const result = await criarSala({}, formData)
  if (result.message) throw new Error(result.message)
}

export async function encerrarSala(salaId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEETINGS_HOST)
  const parsed = encerrarSalaSchema.safeParse({ salaId })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Sala inválida')

  const sala = await db.salaReuniao.findFirst({
    where: { id: parsed.data.salaId, tenantId: tenant.id },
    select: {
      id: true,
      titulo: true,
      encerradaEm: true,
      _count: { select: { participantes: true } },
    },
  })
  if (!sala) throw new Error('Sala não encontrada.')
  if (sala.encerradaEm) return

  const encerrada = await encerrarSalaNoBanco(tenant.id, parsed.data.salaId)
  if (!encerrada) throw new Error('Não foi possível encerrar a sala.')

  const participantes = sala._count.participantes
  const recap = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: `📹 A sala "${sala.titulo}" foi encerrada. ${participantes} pessoa${participantes === 1 ? '' : 's'} participou${participantes === 1 ? '' : 'ram'}.`,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SALA_REUNIAO_ENCERRADA',
      entidade: 'SalaReuniao',
      entidadeId: parsed.data.salaId,
      detalhes: { recapPostId: recap.id, participantes },
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/comunidade/salas')
  revalidatePath(`/portal/comunidade/salas/${parsed.data.salaId}`)
  revalidatePath(linkPostComunidade(recap.id))
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
}
