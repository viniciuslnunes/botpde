'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { notificarSafe, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { corpoDenunciaModeracao } from '@/lib/notificacoes-routing'
import { operacaoOcultarAlvo, type AlvoModeracao } from '@/lib/moderacao-alvos'
import { tenantParaAvisoDenuncia } from '@/lib/moderacao-aviso'

const denunciaIdSchema = z.object({ denunciaId: z.string().min(1) })

async function reconciliarDenunciaNova(
  tenantId: string | null,
  denuncianteId: string,
  motivo: string,
): Promise<void> {
  if (!tenantId) return
  await reconciliarNotificacoesDoEvento(tenantId, {
    tipo: 'DENUNCIA_NOVA',
    atorId: denuncianteId,
    corpo: motivo.slice(0, 140),
  })
}

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
    select: { id: true, tenantId: true, postId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await reconciliarDenunciaNova(denuncia.tenantId, denuncia.denuncianteId, denuncia.motivo)

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
    select: { id: true, tenantId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await reconciliarDenunciaNova(denuncia.tenantId, denuncia.denuncianteId, denuncia.motivo)

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
    select: { id: true, tenantId: true, mensagemId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await reconciliarDenunciaNova(denuncia.tenantId, denuncia.denuncianteId, denuncia.motivo)

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
    select: { id: true, tenantId: true, denuncianteId: true, motivo: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await reconciliarDenunciaNova(denuncia.tenantId, denuncia.denuncianteId, denuncia.motivo)

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

type ModeracaoDenunciaPlataforma = {
  id: string
  tenantId: string | null
  afiliacaoId: string | null
  alvoTipo: AlvoModeracao
  alvoId: string
  categoria: string
  gravidade: string
  motivo: string | null
  denuncianteId: string
}

/**
 * A fila da plataforma cobre o que o tenant não decide: caso escalado (S4) e
 * denúncia sem tenant (praça do clube). Não abre a fila do tenant por atalho.
 */
async function carregarDenunciaModeracaoDaPlataforma(
  denunciaId: string,
): Promise<ModeracaoDenunciaPlataforma> {
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia: ModeracaoDenunciaPlataforma | null = await db.moderacaoDenuncia.findFirst({
    where: {
      id: parsed.data.denunciaId,
      status: 'PENDENTE',
      OR: [{ escalado: true }, { tenantId: null }],
    },
    select: {
      id: true,
      tenantId: true,
      afiliacaoId: true,
      alvoTipo: true,
      alvoId: true,
      categoria: true,
      gravidade: true,
      motivo: true,
      denuncianteId: true,
    },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')
  return denuncia
}

export async function resolverDenunciaModeracaoSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const denuncia = await carregarDenunciaModeracaoDaPlataforma(denunciaId)

  await reconciliarDenunciaNova(
    denuncia.tenantId,
    denuncia.denuncianteId,
    corpoDenunciaModeracao(denuncia.categoria, denuncia.motivo),
  )

  const avisoTenantId = await tenantParaAvisoDenuncia(denuncia)

  // Superfície sem ocultação (comunicado, evento, perfil, grupo/canal, vitrine):
  // a plataforma é a última instância, então registra a decisão sem mutar o
  // alvo — em vez de oferecer uma ação que não faz nada. A operação é montada
  // aqui e só executa dentro do `$transaction`.
  const ocultar = operacaoOcultarAlvo(denuncia.alvoTipo, denuncia.alvoId)

  await db.$transaction([
    db.moderacaoDenuncia.update({
      where: { id: denuncia.id },
      data: { status: 'RESOLVIDA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    ...(ocultar ? [ocultar] : []),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_FORUM_RESOLVIDA',
        entidade: 'ModeracaoDenuncia',
        entidadeId: denuncia.id,
        detalhes: {
          alvoTipo: denuncia.alvoTipo,
          alvoId: denuncia.alvoId,
          categoria: denuncia.categoria,
          gravidade: denuncia.gravidade,
          conteudoOcultado: Boolean(ocultar),
          soEscalonamento: !ocultar,
          viaSuperAdmin: true,
        },
      },
    }),
  ])

  // Sem tenant (praça de escopo CLUBE) o aviso vai ao tenant sintético da
  // Comunidade Nacional do clube — dono semântico da praça.
  if (avisoTenantId) {
    await notificarSafe({
      userId: denuncia.denuncianteId,
      tenantId: avisoTenantId,
      tipo: 'DENUNCIA_RESOLVIDA',
      titulo: ocultar
        ? 'Sua denúncia foi analisada — conteúdo removido'
        : 'Sua denúncia foi analisada — decisão registrada',
      link: '/portal/comunidade/forum',
    })
  }

  revalidatePath('/super-admin/moderacao')
  revalidatePath('/admin/comunidade/moderacao')
}

export async function descartarDenunciaModeracaoSuperAdminAction(denunciaId: string): Promise<void> {
  const session = await exigirSuperAdmin()
  const denuncia = await carregarDenunciaModeracaoDaPlataforma(denunciaId)

  await reconciliarDenunciaNova(
    denuncia.tenantId,
    denuncia.denuncianteId,
    corpoDenunciaModeracao(denuncia.categoria, denuncia.motivo),
  )

  const avisoTenantId = await tenantParaAvisoDenuncia(denuncia)

  await db.$transaction([
    db.moderacaoDenuncia.update({
      where: { id: denuncia.id },
      data: { status: 'DESCARTADA', resolvidoPorId: session.user.id, resolvidoEm: new Date() },
    }),
    db.auditLog.create({
      data: {
        tenantId: denuncia.tenantId,
        atorId: session.user.id,
        acao: 'DENUNCIA_FORUM_DESCARTADA',
        entidade: 'ModeracaoDenuncia',
        entidadeId: denuncia.id,
        detalhes: {
          alvoTipo: denuncia.alvoTipo,
          alvoId: denuncia.alvoId,
          categoria: denuncia.categoria,
          gravidade: denuncia.gravidade,
          viaSuperAdmin: true,
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

  revalidatePath('/super-admin/moderacao')
  revalidatePath('/admin/comunidade/moderacao')
}
