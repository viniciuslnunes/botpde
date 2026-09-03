'use server'

import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import {
  ConvocarEscalaSchema,
  FUNCAO_ESCALA_LABEL,
  PERMISSIONS,
  StatusEscalaSchema,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { hrefAdminEvento, slugDepartamentoDoEvento } from '@/lib/eventos-admin-href'
import { notificarSafe } from '@/lib/notificacoes'
import { avaliarBeneficio } from '@/lib/elegibilidade'

/**
 * Escala da operação — quem trabalha no evento. Convocar não dá permissão
 * nenhuma (mesma disciplina de área e projeto): é accountability, e o RBAC
 * segue no departamento.
 */

export type EscalaState = {
  ok?: boolean
  errors?: Record<string, string[]>
  message?: string
}

type EventoEscalavel = {
  id: string
  tipo: string
  titulo: string
  data: Date
  departamentoId: string | null
  departamento: { slug: string } | null
  projeto: { departamento: { slug: string } | null } | null
}

async function carregarEventoDoTenant(
  eventoId: string,
  tenantId: string,
): Promise<EventoEscalavel | null> {
  return db.evento.findFirst({
    where: { id: eventoId, tenantId },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      data: true,
      departamentoId: true,
      departamento: { select: { slug: true } },
      projeto: { select: { departamento: { select: { slug: true } } } },
    },
  }) as Promise<EventoEscalavel | null>
}

function revalidarEscala(tenantId: string, eventoId: string) {
  invalidateAdminDirecao(tenantId)
  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/portal/eventos/${eventoId}`)
  revalidatePath('/portal/eventos')
}

/**
 * Convoca alguém para um posto. Uma pessoa ocupa um posto por operação (unique
 * no banco): quem já está escalado tem a função trocada em vez de aparecer
 * duas vezes e inflar a cobertura.
 */
export async function convocarParaEscala(
  _prev: EscalaState,
  formData: FormData,
): Promise<EscalaState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const parsed = ConvocarEscalaSchema.safeParse({
    eventoId: formData.get('eventoId'),
    userId: formData.get('userId'),
    funcao: formData.get('funcao'),
    observacao: formData.get('observacao') || undefined,
    areaId: formData.get('areaId') || undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const { eventoId, userId, funcao, observacao, areaId } = parsed.data

  const evento = await carregarEventoDoTenant(eventoId, tenant.id)
  if (!evento) return { message: 'Evento não encontrado.' }

  // Elegibilidade é a regra única de "pode usar o benefício" (≠ permissão):
  // desligado e bloqueado não assumem posto; inadimplência é aviso, porque
  // barrar quem deve é decisão da liderança, não do sistema.
  const elegivel = await avaliarBeneficio(tenant.id, 'ESCALA', userId)
  if (!elegivel.permitido) {
    return { errors: { userId: elegivel.bloqueios } }
  }

  if (areaId) {
    const area: { id: string } | null = await db.departamentoArea.findFirst({
      where: {
        id: areaId,
        tenantId: tenant.id,
        ...(evento.departamentoId ? { departamentoId: evento.departamentoId } : {}),
      },
      select: { id: true },
    })
    if (!area) return { errors: { areaId: ['Frente não pertence a este departamento'] } }
  }

  const escala: { id: string } = await db.eventoEscala.upsert({
    where: { eventoId_userId: { eventoId, userId } },
    create: {
      tenantId: tenant.id,
      eventoId,
      userId,
      funcao,
      areaId: areaId ?? null,
      observacao: observacao ?? null,
      convocadoPorId: session.user.id,
    },
    update: {
      funcao,
      areaId: areaId ?? null,
      observacao: observacao ?? null,
      // Trocar o posto reabre a pergunta: quem aceitou "porta do ônibus" não
      // aceitou "dirigir".
      status: 'CONVOCADO',
      respondidoEm: null,
      convocadoPorId: session.user.id,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_ESCALA_CONVOCADO',
      entidade: 'EventoEscala',
      entidadeId: escala.id,
      detalhes: {
        eventoId,
        userId,
        funcao,
        areaId: areaId ?? null,
        avisosElegibilidade: elegivel.avisos,
      },
    },
  })

  await notificarSafe({
    userId,
    tenantId: tenant.id,
    tipo: 'ESCALA_CONVOCADO',
    titulo: `Você está escalado: ${FUNCAO_ESCALA_LABEL[funcao] ?? funcao}`,
    corpo: `${evento.titulo} — confirme se você assume o posto.`,
    link: `/portal/eventos/${eventoId}`,
    atorId: session.user.id,
  })

  revalidarEscala(tenant.id, eventoId)
  // Aviso não impede a convocação — aparece para quem escalou decidir.
  return elegivel.avisos.length > 0
    ? { ok: true, message: `Escalado com ressalva: ${elegivel.avisos.join(', ')}.` }
    : { ok: true }
}

/** Tira alguém da escala. O posto some da cobertura — é o buraco a cobrir. */
export async function removerDaEscala(escalaId: string): Promise<EscalaState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const escala: { id: string; eventoId: string; userId: string; funcao: string } | null =
    await db.eventoEscala.findFirst({
      where: { id: escalaId, tenantId: tenant.id },
      select: { id: true, eventoId: true, userId: true, funcao: true },
    })
  if (!escala) return { message: 'Convocação não encontrada.' }

  await db.eventoEscala.delete({ where: { id: escala.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_ESCALA_REMOVIDO',
      entidade: 'EventoEscala',
      entidadeId: escala.id,
      detalhes: { eventoId: escala.eventoId, userId: escala.userId, funcao: escala.funcao },
    },
  })

  revalidarEscala(tenant.id, escala.eventoId)
  return { ok: true }
}

/**
 * Gestor mexe no status pela pessoa — quem avisou por telefone que não vai, ou
 * quem foi substituído. A trilha guarda quem mudou por quem.
 */
export async function atualizarStatusEscala(
  escalaId: string,
  statusRaw: string,
): Promise<EscalaState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)

  const parsed = StatusEscalaSchema.safeParse(statusRaw)
  if (!parsed.success) return { message: 'Status inválido.' }
  const status = parsed.data

  const escala: { id: string; eventoId: string; userId: string; status: string } | null =
    await db.eventoEscala.findFirst({
      where: { id: escalaId, tenantId: tenant.id },
      select: { id: true, eventoId: true, userId: true, status: true },
    })
  if (!escala) return { message: 'Convocação não encontrada.' }

  await db.eventoEscala.update({
    where: { id: escala.id },
    data: { status, respondidoEm: status === 'CONVOCADO' ? null : new Date() },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_ESCALA_STATUS',
      entidade: 'EventoEscala',
      entidadeId: escala.id,
      detalhes: {
        eventoId: escala.eventoId,
        userId: escala.userId,
        de: escala.status,
        para: status,
        porGestor: true,
      },
    },
  })

  revalidarEscala(tenant.id, escala.eventoId)
  return { ok: true }
}

/** Href do hub que opera o evento — usado ao avisar o gestor de uma resposta. */
export async function hrefDoEventoParaGestor(eventoId: string, tenantId: string): Promise<string> {
  const evento = await carregarEventoDoTenant(eventoId, tenantId)
  if (!evento) return `/admin/eventos/${eventoId}`
  return hrefAdminEvento({
    id: evento.id,
    tipo: evento.tipo,
    departamentoSlug: slugDepartamentoDoEvento(evento),
  })
}
