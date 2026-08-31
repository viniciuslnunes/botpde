'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  AlternarMemoriaPresencaSchema,
  CriarMemoriaFatoSchema,
  DecidirMemoriaFatoSchema,
  diaValidoParaFatoAtrasado,
  diaValidoParaPublicarMemoria,
  MEMORIA_ESCOPO,
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { assertPermission } from '@/lib/authz'
import { ExpectedError, isExpectedError } from '@/lib/expected-error'
import { todayDateOnlyIso, parseDateOnly, startOfZonedDayUtc } from '@/lib/format-datetime'
import { notificarSafe } from '@/lib/notificacoes'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'

export type MemoriaActionState = { ok?: boolean; error?: string }

function revalidateMemoria(userId?: string) {
  revalidatePath('/portal/memoria')
  revalidatePath('/admin/comunidade/memoria')
  if (userId) revalidatePath(`/portal/comunidade/perfil/${userId}`)
}

async function tenantPortalDoUsuario() {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Entre para continuar.')
  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant || tenant.sintetico) {
    throw new ExpectedError('A memória atrasada só existe na unidade, não no clube.')
  }
  return { session, tenant }
}

async function assertPodeCriarFato(userId: string, tenantId: string) {
  const membro: { tipo: 'SOCIO' | 'TORCEDOR'; status: string } | null =
    await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { tipo: true, status: true },
    })
  if (membro?.status !== 'APROVADO') {
    throw new ExpectedError('Só quem está aprovado na unidade liga um fato ao dia.')
  }
  if (membro.tipo === 'TORCEDOR') return
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(effective, PERMISSIONS.COMMUNITY_POST)) {
    throw new ExpectedError('Você não tem permissão para publicar na memória.')
  }
}

export async function criarMemoriaFato(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = CriarMemoriaFatoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Fato inválido')
    }
    const { session, tenant } = await tenantPortalDoUsuario()
    await assertPodeCriarFato(session.user.id, tenant.id)

    const hoje = todayDateOnlyIso()
    if (!diaValidoParaPublicarMemoria(parsed.data.dia, hoje)) {
      throw new ExpectedError(
        parsed.data.dia > hoje
          ? 'Esse dia ainda não está no calendário da memória.'
          : 'A memória só vai até 5 anos atrás.',
      )
    }
    const atrasado = diaValidoParaFatoAtrasado(parsed.data.dia, hoje)

    if (parsed.data.postId) {
      const post: { id: string; tenantId: string; oculto: boolean } | null = await db.post.findUnique({
        where: { id: parsed.data.postId },
        select: { id: true, tenantId: true, oculto: true },
      })
      if (!post || post.oculto || post.tenantId !== tenant.id) {
        throw new ExpectedError('Esse post não pode ser ligado a este dia.')
      }
    }
    if (parsed.data.eventoId) {
      const evento: { id: string; tenantId: string } | null = await db.evento.findUnique({
        where: { id: parsed.data.eventoId },
        select: { id: true, tenantId: true },
      })
      if (!evento || evento.tenantId !== tenant.id) {
        throw new ExpectedError('Esse evento não é desta unidade.')
      }
    }

    const dia = startOfZonedDayUtc(parseDateOnly(parsed.data.dia))
    const criado: { id: string } = await db.memoriaFato.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        dia,
        conteudo: parsed.data.conteudo,
        midiaUrls: parsed.data.midiaUrls,
        visibilidade: parsed.data.visibilidade,
        status: atrasado ? 'PENDENTE' : 'APROVADA',
        decididoEm: atrasado ? null : new Date(),
        postId: parsed.data.postId,
        eventoId: parsed.data.eventoId,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_FATO_CRIADO',
        entidade: 'MemoriaFato',
        entidadeId: criado.id,
        detalhes: {
          dia: parsed.data.dia,
          visibilidade: parsed.data.visibilidade,
          status: atrasado ? 'PENDENTE' : 'APROVADA',
        },
      },
    })

    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function decidirMemoriaFato(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = DecidirMemoriaFatoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Decisão inválida')
    }
    if (parsed.data.decidir === 'rejeitar' && !parsed.data.motivo?.trim()) {
      throw new ExpectedError('Diga o motivo da recusa.')
    }

    const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
    const fato: {
      id: string
      status: string
      autorId: string
      dia: Date
      tenantId: string
    } | null = await db.memoriaFato.findFirst({
      where: { id: parsed.data.id, tenantId: tenant.id },
      select: { id: true, status: true, autorId: true, dia: true, tenantId: true },
    })
    if (!fato) throw new ExpectedError('Fato não encontrado.')
    if (fato.status !== 'PENDENTE') throw new ExpectedError('Este fato já foi decidido.')

    const aprovado = parsed.data.decidir === 'aprovar'
    await db.memoriaFato.update({
      where: { id: fato.id },
      data: {
        status: aprovado ? 'APROVADA' : 'REJEITADA',
        aprovadoPorId: session.user.id,
        decididoEm: new Date(),
        motivoRejeicao: aprovado ? null : parsed.data.motivo?.trim(),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: aprovado ? 'MEMORIA_FATO_APROVADO' : 'MEMORIA_FATO_REJEITADO',
        entidade: 'MemoriaFato',
        entidadeId: fato.id,
        detalhes: { motivo: parsed.data.motivo ?? null },
      },
    })

    const diaIso = fato.dia.toISOString().slice(0, 10)
    await notificarSafe({
      userId: fato.autorId,
      tenantId: tenant.id,
      tipo: 'MEMORIA_FATO_DECIDIDA',
      titulo: aprovado ? 'Sua memória foi aprovada' : 'Sua memória não entrou na linha',
      corpo: aprovado
        ? 'O fato que você ligou àquele dia agora aparece na memória da unidade.'
        : parsed.data.motivo?.trim() || 'A moderação recusou o fato.',
      link: `/portal/memoria?escopo=${MEMORIA_ESCOPO.UNIDADE}&dia=${diaIso}`,
      atorId: session.user.id,
    })

    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function alternarMemoriaPresenca(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = AlternarMemoriaPresencaSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Opção inválida')
    }
    const { session, tenant } = await tenantPortalDoUsuario()

    await db.perfilMembro.upsert({
      where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
      create: {
        userId: session.user.id,
        tenantId: tenant.id,
        memoriaPresencaVisivel: parsed.data.visivel,
      },
      update: { memoriaPresencaVisivel: parsed.data.visivel },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_PRESENCA_ALTERADA',
        entidade: 'PerfilMembro',
        entidadeId: session.user.id,
        detalhes: { visivel: parsed.data.visivel },
      },
    })

    revalidateMemoria(session.user.id)
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}
