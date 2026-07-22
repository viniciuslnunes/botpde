'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/authz'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

const denunciaIdSchema = z.object({ denunciaId: z.string().min(1) })

/**
 * Marca como lida a notificação `DENUNCIA_NOVA` correspondente a esta denúncia
 * para o admin que está decidindo. A notificação não guarda `denunciaId`
 * (link genérico para a fila de moderação), então usamos `atorId` (denunciante)
 * + `corpo` (motivo truncado, igual ao criado no fan-out) para amarrar à
 * denúncia específica sem afetar notificações de outras denúncias do mesmo
 * denunciante.
 */
async function marcarNotificacaoDenunciaLida(
  userId: string,
  tenantId: string,
  denuncianteId: string,
  motivo: string,
): Promise<void> {
  await db.notificacao.updateMany({
    where: {
      userId,
      tenantId,
      atorId: denuncianteId,
      tipo: 'DENUNCIA_NOVA',
      corpo: motivo.slice(0, 140),
      lida: false,
    },
    data: { lida: true },
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

  await marcarNotificacaoDenunciaLida(session.user.id, tenant.id, denuncia.denuncianteId, denuncia.motivo)

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

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/portal/comunidade')
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

  await marcarNotificacaoDenunciaLida(session.user.id, tenant.id, denuncia.denuncianteId, denuncia.motivo)

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

  revalidatePath('/admin/comunidade/moderacao')
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

  await marcarNotificacaoDenunciaLida(session.user.id, tenant.id, denuncia.denuncianteId, denuncia.motivo)

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

  revalidatePath('/admin/comunidade/moderacao')
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

  await marcarNotificacaoDenunciaLida(session.user.id, tenant.id, denuncia.denuncianteId, denuncia.motivo)

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

  revalidatePath('/admin/comunidade/moderacao')
}
