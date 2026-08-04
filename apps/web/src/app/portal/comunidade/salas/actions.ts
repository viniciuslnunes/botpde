'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Session } from 'next-auth'
import { assertComunidadeNacional, assertNaoOperador, assertPermission } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { isLiveKitConfigured } from '@/lib/env'
import { deleteLiveKitRoom } from '@/lib/livekit-room'
import { createSala, encerrarSala as encerrarSalaNoBanco } from '@/lib/salas'
import { assertSalaAnfitriao, assertSalaMembro } from '@/lib/salas-api'
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

/**
 * Sala aberta na Comunidade Nacional do clube — anfitrião é qualquer
 * torcedor/sócio com afiliação resolvível (`assertComunidadeNacional`).
 * Só `ABERTA`: eventos/reuniões restritas ficam no caminho da torcida real.
 */
export async function criarSalaNacional(
  _prev: CriarSalaState,
  formData: FormData,
): Promise<CriarSalaState> {
  try {
    await assertNaoOperador()
    const { session, tenantSintetico } = await assertComunidadeNacional()

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

    const sala = await createSala({
      tenantId: tenantSintetico.id,
      hostId: session.user.id,
      titulo: parsed.data.titulo,
      tipo: 'ABERTA',
    })

    await db.auditLog.create({
      data: {
        tenantId: tenantSintetico.id,
        atorId: session.user.id,
        acao: 'SALA_REUNIAO_CRIADA',
        entidade: 'SalaReuniao',
        entidadeId: sala.id,
        detalhes: { tipo: sala.tipo, escopo: 'nacional' },
      },
    })

    revalidatePath('/portal/comunidade/salas')
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
  if (result.message) throw new ExpectedError(result.message)
}

export async function encerrarSala(salaId: string) {
  const parsed = encerrarSalaSchema.safeParse({ salaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Sala inválida')

  let session: Session
  let tenantId: string

  try {
    const ctx = await assertPermission(PERMISSIONS.MEETINGS_HOST)
    session = ctx.session
    tenantId = ctx.tenant.id
  } catch {
    const nacional = await assertSalaAnfitriao(parsed.data.salaId)
    const tenantMeta: { sintetico: boolean } | null = await db.tenant.findUnique({
      where: { id: nacional.sala.tenantId },
      select: { sintetico: true },
    })
    if (!tenantMeta?.sintetico) {
      throw new Error('Sem permissão para encerrar esta sala.')
    }
    session = nacional.session
    tenantId = nacional.sala.tenantId
  }

  if (!session.user?.id) throw new Error('Não autenticado.')

  const sala = await db.salaReuniao.findFirst({
    where: { id: parsed.data.salaId, tenantId },
    select: {
      id: true,
      titulo: true,
      livekitRoomName: true,
      encerradaEm: true,
      _count: { select: { participantes: true } },
    },
  })
  if (!sala) throw new Error('Sala não encontrada.')
  if (sala.encerradaEm) return

  const encerrada = await encerrarSalaNoBanco(tenantId, parsed.data.salaId)
  if (!encerrada) throw new Error('Não foi possível encerrar a sala.')

  if (isLiveKitConfigured()) {
    try {
      await deleteLiveKitRoom(sala.livekitRoomName)
    } catch (error) {
      console.error('[encerrarSala] Falha ao encerrar sala LiveKit:', error)
    }
  }

  const participantes = sala._count.participantes
  const recap = await db.post.create({
    data: {
      tenantId,
      autorId: session.user.id,
      conteudo: `📹 A sala "${sala.titulo}" foi encerrada. ${participantes} pessoa${participantes === 1 ? '' : 's'} participou${participantes === 1 ? '' : 'ram'}.`,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
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
  const parsed = enviarMensagemSchema.safeParse({
    salaId: formData.get('salaId'),
    conteudo: formData.get('conteudo'),
  })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Mensagem inválida')

  const { session, sala, isSuperAdminViewer } = await assertSalaMembro(parsed.data.salaId)
  if (isSuperAdminViewer) {
    throw new ExpectedError('Super admin tem acesso somente de visualização a esta sala.')
  }

  await db.mensagemReuniao.create({
    data: {
      salaId: sala.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
    },
  })
}
