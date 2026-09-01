'use server'

import { revalidatePath } from 'next/cache'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/authz'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { notificarSafe, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { corpoDenunciaModeracao } from '@/lib/notificacoes-routing'
import { operacaoOcultarAlvo, type AlvoModeracao } from '@/lib/moderacao-alvos'
import { tenantParaAvisoDenuncia } from '@/lib/moderacao-aviso'

const denunciaIdSchema = z.object({ denunciaId: z.string().min(1) })

/**
 * Marca como lida a notificação `DENUNCIA_NOVA` desta denúncia para **todos os
 * moderadores** que a receberam, não só para quem decidiu — a denúncia está
 * resolvida para a equipe inteira. A notificação não guarda `denunciaId`
 * (link genérico para a fila de moderação), então usamos `atorId` (denunciante)
 * + `corpo` (motivo truncado, igual ao criado no fan-out) para amarrar à
 * denúncia específica sem afetar notificações de outras denúncias do mesmo
 * denunciante.
 */
async function marcarNotificacaoDenunciaLida(
  tenantId: string,
  denuncianteId: string,
  motivo: string,
): Promise<void> {
  await reconciliarNotificacoesDoEvento(tenantId, {
    tipo: 'DENUNCIA_NOVA',
    atorId: denuncianteId,
    corpo: motivo.slice(0, 140),
  })
}

export async function resolverDenuncia(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true, postId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await marcarNotificacaoDenunciaLida(tenant.id, denuncia.denuncianteId, denuncia.motivo)

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: {
        status: 'RESOLVIDA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.post.update({
      where: { id: denuncia.postId },
      data: { oculto: true },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_RESOLVIDA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
        detalhes: { postOcultado: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: tenant.id,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — conteúdo removido',
    link: '/portal/comunidade',
  })

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  invalidateAdminDirecao(tenant.id)
}

export async function resolverDenunciaMensagem(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denunciaMensagem.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true, mensagemId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await marcarNotificacaoDenunciaLida(tenant.id, denuncia.denuncianteId, denuncia.motivo)

  await db.$transaction([
    db.denunciaMensagem.update({
      where: { id: denuncia.id },
      data: {
        status: 'RESOLVIDA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.mensagemDireta.update({
      where: { id: denuncia.mensagemId },
      data: { removidaEm: new Date() },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_MENSAGEM_RESOLVIDA',
        entidade: 'DenunciaMensagem',
        entidadeId: denuncia.id,
        detalhes: { mensagemRemovida: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: tenant.id,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — mensagem removida',
    link: '/portal/mensagens',
  })

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  invalidateAdminDirecao(tenant.id)
}

export async function descartarDenunciaMensagem(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denunciaMensagem.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await marcarNotificacaoDenunciaLida(tenant.id, denuncia.denuncianteId, denuncia.motivo)

  await db.$transaction([
    db.denunciaMensagem.update({
      where: { id: denuncia.id },
      data: {
        status: 'DESCARTADA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_MENSAGEM_DESCARTADA',
        entidade: 'DenunciaMensagem',
        entidadeId: denuncia.id,
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: tenant.id,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — sem violação encontrada',
    link: '/portal/mensagens',
  })

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  invalidateAdminDirecao(tenant.id)
}

export async function descartarDenuncia(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await marcarNotificacaoDenunciaLida(tenant.id, denuncia.denuncianteId, denuncia.motivo)

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: {
        status: 'DESCARTADA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_DESCARTADA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: tenant.id,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — sem violação encontrada',
    link: '/portal/comunidade',
  })

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  invalidateAdminDirecao(tenant.id)
}

type ModeracaoDenunciaFila = {
  id: string
  alvoTipo: AlvoModeracao
  alvoId: string
  tenantId: string | null
  afiliacaoId: string | null
  categoria: string
  gravidade: string
  motivo: string | null
  escalado: boolean
  denuncianteId: string
}

/**
 * Denúncia S4 nasce `escalado` e é decidida pela plataforma (política §4). O
 * moderador do tenant vê que o caso existe, mas não encerra.
 */
function recusarSeEscalado(denuncia: ModeracaoDenunciaFila): void {
  if (denuncia.escalado) {
    throw new Error(
      'Esta denúncia é crítica e está em análise da plataforma. O tenant não pode encerrá-la.',
    )
  }
}

async function carregarDenunciaModeracaoDoTenant(
  denunciaId: string,
  tenantId: string,
): Promise<ModeracaoDenunciaFila> {
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia: ModeracaoDenunciaFila | null = await db.moderacaoDenuncia.findFirst({
    where: { id: parsed.data.denunciaId, tenantId, status: 'PENDENTE' },
    select: {
      id: true,
      alvoTipo: true,
      alvoId: true,
      tenantId: true,
      afiliacaoId: true,
      categoria: true,
      gravidade: true,
      motivo: true,
      escalado: true,
      denuncianteId: true,
    },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')
  return denuncia
}

export async function resolverDenunciaModeracao(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const denuncia = await carregarDenunciaModeracaoDoTenant(denunciaId, tenant.id)
  recusarSeEscalado(denuncia)

  await marcarNotificacaoDenunciaLida(
    tenant.id,
    denuncia.denuncianteId,
    corpoDenunciaModeracao(denuncia.categoria, denuncia.motivo),
  )

  // Superfície sem ocultação (comunicado, evento, perfil, grupo/canal, vitrine):
  // a decisão fica registrada e o caso sobe para a plataforma — não se finge
  // que agiu sobre um alvo que não tem como ser escondido.
  const ocultar = operacaoOcultarAlvo(denuncia.alvoTipo, denuncia.alvoId)
  const soEscala = ocultar === null
  const avisoTenantId = await tenantParaAvisoDenuncia(denuncia)

  await db.$transaction([
    db.moderacaoDenuncia.update({
      where: { id: denuncia.id },
      data: soEscala
        ? { escalado: true }
        : {
            status: 'RESOLVIDA',
            resolvidoPorId: session.user.id,
            resolvidoEm: new Date(),
          },
    }),
    ...(ocultar ? [ocultar] : []),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: soEscala ? 'DENUNCIA_FORUM_ESCALADA' : 'DENUNCIA_FORUM_RESOLVIDA',
        entidade: 'ModeracaoDenuncia',
        entidadeId: denuncia.id,
        detalhes: {
          alvoTipo: denuncia.alvoTipo,
          alvoId: denuncia.alvoId,
          categoria: denuncia.categoria,
          gravidade: denuncia.gravidade,
          conteudoOcultado: !soEscala,
          soEscalonamento: soEscala,
        },
      },
    }),
  ])

  if (avisoTenantId) {
    await notificarSafe({
      userId: denuncia.denuncianteId,
      tenantId: avisoTenantId,
      tipo: 'DENUNCIA_RESOLVIDA',
      titulo: soEscala
        ? 'Sua denúncia foi encaminhada para a plataforma'
        : 'Sua denúncia foi analisada — conteúdo removido',
      link: '/portal/comunidade/forum',
    })
  }

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade/forum')
  if (soEscala) revalidatePath('/super-admin/moderacao')
  invalidateAdminDirecao(tenant.id)
}

export async function descartarDenunciaModeracao(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const denuncia = await carregarDenunciaModeracaoDoTenant(denunciaId, tenant.id)
  recusarSeEscalado(denuncia)

  await marcarNotificacaoDenunciaLida(
    tenant.id,
    denuncia.denuncianteId,
    corpoDenunciaModeracao(denuncia.categoria, denuncia.motivo),
  )

  const avisoTenantId = await tenantParaAvisoDenuncia(denuncia)

  await db.$transaction([
    db.moderacaoDenuncia.update({
      where: { id: denuncia.id },
      data: {
        status: 'DESCARTADA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_FORUM_DESCARTADA',
        entidade: 'ModeracaoDenuncia',
        entidadeId: denuncia.id,
        detalhes: {
          alvoTipo: denuncia.alvoTipo,
          alvoId: denuncia.alvoId,
          categoria: denuncia.categoria,
          gravidade: denuncia.gravidade,
        },
      },
    }),
  ])

  if (avisoTenantId) {
    await notificarSafe({
      userId: denuncia.denuncianteId,
      tenantId: avisoTenantId,
      tipo: 'DENUNCIA_RESOLVIDA',
      titulo: 'Sua denúncia foi analisada — sem violação encontrada',
      link: '/portal/comunidade/forum',
    })
  }

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/admin/comunidade')
  invalidateAdminDirecao(tenant.id)
}
