'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Alianca, StatusAlianca } from '@torcida/db'
import { z } from 'zod'
import { assertAliancasManage } from '@/lib/authz'
import { findAliancaEntreTenants } from '@/lib/aliancas'
import { getTorcidaLineageTenantIds, invalidateHierarchyCache, tenantsAreRivais } from '@/lib/hierarquia'
import { isTenantRestrito } from '@/lib/isolamento'
import { ExpectedError } from '@/lib/expected-error'
import { notificarUsuariosComPermissao, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { formatNomeTorcida, PERMISSIONS } from '@torcida/types'

const uuidSchema = z.string().uuid('ID inválido')

interface TenantLite {
  id: string
  nome: string
  slug: string
  afiliacaoId: string | null
}

async function invalidateAliancaHierarchy(origemId: string, aliadoId: string): Promise<void> {
  const [lineA, lineB] = await Promise.all([
    getTorcidaLineageTenantIds(origemId),
    getTorcidaLineageTenantIds(aliadoId),
  ])
  for (const id of new Set([...lineA, ...lineB])) {
    invalidateHierarchyCache(id)
  }
}

/**
 * R5 — canal restrito: enquanto a unidade está isolada, nenhuma aliança NOVA
 * pode ser firmada (nem proposta, nem aceita). As alianças já ATIVAS continuam
 * gravadas e apenas inertes — voltam sozinhas quando o canal reabre.
 */
async function assertCanalNaoRestrito(tenantId: string): Promise<void> {
  if (await isTenantRestrito(tenantId)) {
    throw new ExpectedError(
      'O canal desta unidade está restrito. Reative o canal em Configurações para firmar alianças.',
    )
  }
}

async function loadAliancaInTenant(aliancaId: string, tenantId: string): Promise<Alianca | null> {
  const alianca: Alianca | null = await db.alianca.findFirst({
    where: {
      id: aliancaId,
      OR: [{ tenantOrigemId: tenantId }, { tenantAliadoId: tenantId }],
    },
  })
  return alianca
}

function assertStatus(alianca: Alianca, expected: StatusAlianca): void {
  if (alianca.status !== expected) {
    throw new Error(`A aliança precisa estar em ${expected.toLowerCase()} para esta ação`)
  }
}

async function nomeDoTenant(id: string): Promise<string> {
  const t: { nome: string } | null = await db.tenant.findUnique({
    where: { id },
    select: { nome: true },
  })
  return t?.nome ?? 'uma torcida'
}

async function reconciliarPropostaAlianca(
  tenantDestinoId: string,
  origemNome: string,
  destinoNome: string,
): Promise<void> {
  await reconciliarNotificacoesDoEvento(tenantDestinoId, {
    tipo: 'ALIANCA_PROPOSTA',
    corpo: `${origemNome} propôs aliança com ${formatNomeTorcida(destinoNome)}.`,
  })
}

/**
 * Propõe aliança: origem = proponente, aliado = destinatário.
 * Unicidade do par é bidirecional (A→B e B→A contam como o mesmo vínculo).
 */
export async function proporAlianca(tenantAliadoId: string): Promise<void> {
  const { session, tenant } = await assertAliancasManage()
  await assertCanalNaoRestrito(tenant.id)

  const parsed = uuidSchema.safeParse(tenantAliadoId)
  if (!parsed.success) throw new Error('Torcida aliada inválida')
  if (parsed.data === tenant.id) throw new Error('Você não pode propor aliança para a própria torcida')

  const tenantOrigemId = tenant.id
  const tenantDestinoId = parsed.data

  const aliado: TenantLite | null = await db.tenant.findFirst({
    where: { id: tenantDestinoId, ativo: true },
    select: { id: true, nome: true, slug: true, afiliacaoId: true },
  })
  if (!aliado) throw new Error('Torcida aliada não encontrada')

  // Rival = inexistente: mesma mensagem, sem notificação, sem linha PENDENTE.
  if (await tenantsAreRivais(tenantOrigemId, tenantDestinoId)) {
    throw new Error('Torcida aliada não encontrada')
  }
  if (await isTenantRestrito(tenantDestinoId)) {
    throw new Error('Torcida aliada não encontrada')
  }

  const origemAfiliacao: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantOrigemId },
    select: { afiliacaoId: true },
  })
  if (
    origemAfiliacao?.afiliacaoId &&
    aliado.afiliacaoId &&
    origemAfiliacao.afiliacaoId === aliado.afiliacaoId
  ) {
    throw new Error(
      'Organizadas do mesmo time são co-irmãs, não aliadas — use o painel de recomendações (co-irmã)',
    )
  }

  const existente = await findAliancaEntreTenants(tenantOrigemId, tenantDestinoId)

  let aliancaId = existente?.id ?? null
  if (!existente) {
    const criada: Alianca = await db.alianca.create({
      data: {
        tenantOrigemId,
        tenantAliadoId: tenantDestinoId,
        propostaPorId: session.user.id,
        status: 'PENDENTE',
      },
    })
    aliancaId = criada.id
  } else if (existente.status === 'ENCERRADA') {
    const reaberta: Alianca = await db.alianca.update({
      where: { id: existente.id },
      data: {
        tenantOrigemId,
        tenantAliadoId: tenantDestinoId,
        status: 'PENDENTE',
        propostaPorId: session.user.id,
        confirmadaPorId: null,
        confirmadaEm: null,
      },
    })
    aliancaId = reaberta.id
  } else if (existente.status === 'PENDENTE') {
    throw new Error('Já existe uma proposta de aliança pendente com esta torcida')
  } else {
    throw new Error('Esta torcida já possui aliança ativa com você')
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_PROPOSTA',
      entidade: 'Alianca',
      entidadeId: aliancaId,
      detalhes: {
        tenantAliadoId: aliado.id,
        tenantAliadoSlug: aliado.slug,
        tenantAliadoNome: aliado.nome,
      },
    },
  })

  // Sem excetoUserId: a inbox do destinatário inclui quem propôs se também
  // gerencia (ou opera) o tenant destino — comum em modo operador / dual-hat.
  await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
    tenantId: tenantDestinoId,
    tipo: 'ALIANCA_PROPOSTA',
    titulo: `Proposta de aliança de ${tenant.nome}`,
    corpo: `${tenant.nome} propôs aliança com ${formatNomeTorcida(aliado.nome)}.`,
    link: '/admin/aliancas?tab=recebidas',
    atorId: session.user.id,
  })

  revalidatePath('/admin/aliancas')
  await invalidateAliancaHierarchy(tenantOrigemId, tenantDestinoId)
}

/**
 * Propõe a partir de uma recomendação ALTA com tenant mapeado.
 */
export async function proporAliancaFromRecomendacao(recomendacaoId: string): Promise<void> {
  const { tenant } = await assertAliancasManage()

  const parsed = uuidSchema.safeParse(recomendacaoId)
  if (!parsed.success) throw new Error('Recomendação inválida')

  const recomendacao: {
    id: string
    tenantId: string
    tenantSugeridoId: string | null
    nomeSugerido: string
    confianca: 'ALTA' | 'MEDIA' | 'BAIXA'
  } | null = await db.recomendacaoAlianca.findFirst({
    where: { id: parsed.data, tenantId: tenant.id },
    select: {
      id: true,
      tenantId: true,
      tenantSugeridoId: true,
      nomeSugerido: true,
      confianca: true,
    },
  })
  if (!recomendacao) throw new Error('Recomendação não encontrada')
  if (recomendacao.confianca !== 'ALTA') {
    throw new Error('Somente recomendações de alta confiança podem virar proposta automática')
  }
  if (!recomendacao.tenantSugeridoId) {
    throw new Error(
      `${recomendacao.nomeSugerido} ainda não está na plataforma — não é possível enviar a proposta automaticamente`,
    )
  }

  await proporAlianca(recomendacao.tenantSugeridoId)
}

export async function aceitarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertAliancasManage()
  await assertCanalNaoRestrito(tenant.id)

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  const outroId =
    alianca.tenantOrigemId === tenant.id ? alianca.tenantAliadoId : alianca.tenantOrigemId
  if (await tenantsAreRivais(tenant.id, outroId)) {
    throw new Error('Aliança não encontrada')
  }
  if (alianca.tenantAliadoId !== tenant.id) {
    throw new Error('Somente o destinatário da proposta pode aceitá-la')
  }
  assertStatus(alianca, 'PENDENTE')

  await db.alianca.update({
    where: { id: alianca.id },
    data: {
      status: 'ATIVA',
      confirmadaPorId: session.user.id,
      confirmadaEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_ACEITA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  await reconciliarPropostaAlianca(
    tenant.id,
    await nomeDoTenant(alianca.tenantOrigemId),
    tenant.nome,
  )

  await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
    tenantId: alianca.tenantOrigemId,
    tipo: 'ALIANCA_ACEITA',
    titulo: `${tenant.nome} aceitou a aliança`,
    corpo: 'A proposta de aliança foi aceita e está ativa.',
    link: '/admin/aliancas?tab=ativas',
    excetoUserId: session.user.id,
  })

  revalidatePath('/admin/aliancas')
  await invalidateAliancaHierarchy(alianca.tenantOrigemId, alianca.tenantAliadoId)
}

export async function rejeitarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertAliancasManage()

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  if (alianca.tenantAliadoId !== tenant.id) {
    throw new Error('Somente o destinatário da proposta pode rejeitá-la')
  }
  assertStatus(alianca, 'PENDENTE')

  await db.alianca.update({
    where: { id: alianca.id },
    data: {
      status: 'ENCERRADA',
      confirmadaPorId: session.user.id,
      confirmadaEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_REJEITADA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  await reconciliarPropostaAlianca(
    tenant.id,
    await nomeDoTenant(alianca.tenantOrigemId),
    tenant.nome,
  )

  await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
    tenantId: alianca.tenantOrigemId,
    tipo: 'ALIANCA_REJEITADA',
    titulo: `${tenant.nome} rejeitou a aliança`,
    corpo: 'A proposta de aliança foi rejeitada.',
    link: '/admin/aliancas?tab=historico',
    excetoUserId: session.user.id,
  })

  revalidatePath('/admin/aliancas')
  await invalidateAliancaHierarchy(alianca.tenantOrigemId, alianca.tenantAliadoId)
}

/**
 * Cancela proposta enviada — só o tenant origem, enquanto PENDENTE.
 */
export async function cancelarProposta(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertAliancasManage()

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  if (alianca.tenantOrigemId !== tenant.id) {
    throw new Error('Somente quem enviou a proposta pode cancelá-la')
  }
  assertStatus(alianca, 'PENDENTE')

  await db.alianca.update({
    where: { id: alianca.id },
    data: {
      status: 'ENCERRADA',
      confirmadaPorId: session.user.id,
      confirmadaEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_CANCELADA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  await reconciliarPropostaAlianca(
    alianca.tenantAliadoId,
    tenant.nome,
    await nomeDoTenant(alianca.tenantAliadoId),
  )

  await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
    tenantId: alianca.tenantAliadoId,
    tipo: 'ALIANCA_CANCELADA',
    titulo: `${tenant.nome} cancelou a proposta`,
    corpo: 'A proposta de aliança pendente foi cancelada.',
    link: '/admin/aliancas?tab=historico',
    excetoUserId: session.user.id,
  })

  revalidatePath('/admin/aliancas')
  await invalidateAliancaHierarchy(alianca.tenantOrigemId, alianca.tenantAliadoId)
}

export async function encerrarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertAliancasManage()

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  assertStatus(alianca, 'ATIVA')

  await db.alianca.update({
    where: { id: alianca.id },
    data: { status: 'ENCERRADA' },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_ENCERRADA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  const outroTenantId =
    alianca.tenantOrigemId === tenant.id ? alianca.tenantAliadoId : alianca.tenantOrigemId
  await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
    tenantId: outroTenantId,
    tipo: 'ALIANCA_ENCERRADA',
    titulo: `${tenant.nome} encerrou a aliança`,
    corpo: 'A aliança ativa foi encerrada.',
    link: '/admin/aliancas?tab=historico',
    excetoUserId: session.user.id,
  })

  revalidatePath('/admin/aliancas')
  await invalidateAliancaHierarchy(alianca.tenantOrigemId, alianca.tenantAliadoId)
}
