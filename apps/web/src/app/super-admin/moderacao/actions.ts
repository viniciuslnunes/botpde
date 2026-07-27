'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { notificarSafe } from '@/lib/notificacoes'

const denunciaIdSchema = z.object({ denunciaId: z.string().min(1) })

async function exigirSuperAdmin() {
  const session = await auth()
  if (!session?.user?.id || !session.user.email || !superAdminEmails.includes(session.user.email)) {
    throw new Error('Acesso negado.')
  }
  return session
}

export async function resolverDenunciaSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, status: 'PENDENTE' },
    select: { id: true, tenantId: true, postId: true, denuncianteId: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: { status: 'RESOLVIDA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    db.post.update({ where: { id: denuncia.postId }, data: { oculto: true } }),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_RESOLVIDA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
        detalhes: { postOcultado: true, viaSuperAdmin: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: denuncia.tenantId,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — conteúdo removido',
    link: '/portal/comunidade',
  })

  revalidatePath('/super-admin/moderacao')
}

export async function descartarDenunciaSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, status: 'PENDENTE' },
    select: { id: true, tenantId: true, denuncianteId: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: { status: 'DESCARTADA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_DESCARTADA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
        detalhes: { viaSuperAdmin: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: denuncia.tenantId,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — sem violação encontrada',
    link: '/portal/comunidade',
  })

  revalidatePath('/super-admin/moderacao')
}

export async function resolverDenunciaMensagemSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denunciaMensagem.findFirst({
    where: { id: parsed.data.denunciaId, status: 'PENDENTE' },
    select: { id: true, tenantId: true, mensagemId: true, denuncianteId: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denunciaMensagem.update({
      where: { id: denuncia.id },
      data: { status: 'RESOLVIDA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    db.mensagemDireta.update({ where: { id: denuncia.mensagemId }, data: { removidaEm: new Date() } }),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_MENSAGEM_RESOLVIDA',
        entidade: 'DenunciaMensagem',
        entidadeId: denuncia.id,
        detalhes: { mensagemRemovida: true, viaSuperAdmin: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: denuncia.tenantId,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — mensagem removida',
    link: '/portal/mensagens',
  })

  revalidatePath('/super-admin/moderacao')
}

export async function descartarDenunciaMensagemSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denunciaMensagem.findFirst({
    where: { id: parsed.data.denunciaId, status: 'PENDENTE' },
    select: { id: true, tenantId: true, denuncianteId: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denunciaMensagem.update({
      where: { id: denuncia.id },
      data: { status: 'DESCARTADA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_MENSAGEM_DESCARTADA',
        entidade: 'DenunciaMensagem',
        entidadeId: denuncia.id,
        detalhes: { viaSuperAdmin: true },
      },
    }),
  ])

  await notificarSafe({
    userId: denuncia.denuncianteId,
    tenantId: denuncia.tenantId,
    tipo: 'DENUNCIA_RESOLVIDA',
    titulo: 'Sua denúncia foi analisada — sem violação encontrada',
    link: '/portal/mensagens',
  })

  revalidatePath('/super-admin/moderacao')
}
