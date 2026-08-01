'use server'

import { revalidatePath } from 'next/cache'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertPermission, assertPodeDelegar, assertTenantOwner } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { invalidatePermissionsCache, invalidateTenantCache } from '@/lib/tenant'
import { getAncestorTenantIds, invalidateHierarchyCache } from '@/lib/hierarquia'
import { invalidarCachesComunidadeFeed } from '@/lib/comunidade-cache'
import { getOrCreateCanalOficial } from '@/lib/canais'
import { generateInviteSlug } from '@/lib/invite-slug'
import { getEstadoCanalRestrito, getSolicitacaoRespondivel } from '@/lib/canal-restrito'
import {
  notificarSedeSobreCanal,
  propagarMudancaDeIsolamento,
  reabrirCanal,
} from '@/lib/canal-restrito-mutacoes'
import {
  ALL_PERMISSIONS,
  applyPermissionCascade,
  DEPARTAMENTO_MODULOS,
  editarCanalOficialSchema,
  formatNomeTorcida,
  isDepartamentoLegado,
  PERMISSIONS,
  slugifyDepartamento,
} from '@torcida/types'
import { z } from 'zod'

/**
 * Sanitiza lista de permissões (vocabulário + cascata). Pode ser vazia quando
 * o cargo herda só do departamento.
 */
function sanitizePermissionsList(permissionsRaw: string[]): string[] {
  const canonical: readonly string[] = ALL_PERMISSIONS
  const valid = permissionsRaw.filter((p) => canonical.includes(p))
  return applyPermissionCascade([], valid)
}

function parseDepartamentoPapel(formData: FormData): {
  departamentoId: string | null
  papelNoDepartamento: string | null
} {
  const departamentoIdRaw = String(formData.get('departamentoId') ?? '').trim()
  const papelRaw = String(formData.get('papelNoDepartamento') ?? '').trim()
  const departamentoId = departamentoIdRaw || null
  const papelNoDepartamento =
    papelRaw === 'MEMBRO' || papelRaw === 'GESTOR' ? papelRaw : null
  if (Boolean(departamentoId) !== Boolean(papelNoDepartamento)) {
    throw new Error('Departamento e papel (membro/gestor) devem ser informados juntos.')
  }
  return { departamentoId, papelNoDepartamento }
}

// ── Perfil do tenant ──────────────────────────────────────────────────────────

export async function salvarPerfilTenant(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const nome = formatNomeTorcida(String(formData.get('nome') ?? ''))

  if (!nome) throw new Error('Nome é obrigatório')
  if (nome.length < 3) throw new Error('Nome deve ter ao menos 3 caracteres')

  await db.tenant.update({
    where: { id: tenant.id },
    data: { nome },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_PERFIL_ATUALIZADO',
      detalhes: { nome },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin')
  revalidatePath('/portal')
  invalidateTenantCache(tenant.slug)
}

export async function salvarDiscordGuildId(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const discordGuildId = String(formData.get('discordGuildId') ?? '').trim() || null

  await db.tenant.update({
    where: { id: tenant.id },
    data: { discordGuildId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_DISCORD_ATUALIZADO',
      detalhes: { discordGuildId },
    },
  })

  revalidatePath('/admin/configuracoes')
  invalidateTenantCache(tenant.slug)
}

/** Expõe o balanço detalhado (totais + lançamentos) em `/portal/balanco`. */
export async function salvarBalancoFinanceiroVisivel(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const visivel = formData.get('balancoFinanceiroVisivel') === 'true'

  await db.tenant.update({
    where: { id: tenant.id },
    data: { balancoFinanceiroVisivel: visivel },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'BAR_BALANCO_ALTERADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { visivel },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/portal/balanco')
  revalidatePath('/portal')
  invalidateTenantCache(tenant.slug)
}

/** Define o nível de detalhe do balanço público (TOTAIS / CATEGORIAS / COMPLETO). */
export async function salvarBalancoDetalheNivel(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const raw = String(formData.get('balancoDetalheNivel') ?? '')
  if (raw !== 'TOTAIS' && raw !== 'CATEGORIAS' && raw !== 'COMPLETO') {
    throw new Error('Nível de detalhe inválido')
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { balancoDetalheNivel: raw },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'BAR_BALANCO_DETALHE_ALTERADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { nivel: raw },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/portal/balanco')
  invalidateTenantCache(tenant.slug)
}

/** R3 — permite que subsedes/PDEs descendentes vejam a hierarquia completa da torcida. */
export async function salvarHierarquiaVisivel(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)

  const visivel = formData.get('hierarquiaVisivelParaFilhos') === 'true'

  await db.tenant.update({
    where: { id: tenant.id },
    data: { hierarquiaVisivelParaFilhos: visivel },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_HIERARQUIA_VISIVEL_ATUALIZADA',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { visivel },
    },
  })

  revalidatePath('/admin/configuracoes')
  invalidateHierarchyCache(tenant.id)
}

/** Onboarding SOCIO: exige (ou não) foto do RG e comprovante de residência. */
export async function salvarExigirDocumentosCadastro(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)

  const exigir = formData.get('exigirDocumentosCadastro') === 'true'

  await db.tenant.update({
    where: { id: tenant.id },
    data: { exigirDocumentosCadastro: exigir },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_DOCUMENTOS_CADASTRO_ATUALIZADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { exigir },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/onboarding')
  invalidateTenantCache(tenant.slug)
}

// ── R5 — Canal restrito ───────────────────────────────────────────────────────

/**
 * Só UNIDADE fecha o canal. A Sede raiz não tem de quem se isolar, e fechá-la
 * esconderia a torcida inteira do onboarding e da comunidade nacional.
 *
 * A página já esconde a seção para a raiz, mas isso é gate de cliente: a
 * Server Action é chamável direto, então a regra precisa valer aqui.
 */
async function assertEhUnidadeDaTorcida(tenantId: string): Promise<void> {
  const ancestrais = await getAncestorTenantIds(tenantId)
  if (ancestrais.length === 0) {
    throw new ExpectedError(
      'Só uma subsede ou ponto de encontro pode restringir o canal — a torcida principal, não.',
    )
  }
}

const motivoSchema = z
  .string()
  .trim()
  .min(10, 'Explique em pelo menos 10 caracteres.')
  .max(600, 'Use no máximo 600 caracteres.')

/**
 * Liderança fecha o canal da unidade. Some da malha de interação (comunidade
 * nacional, aliados, salas, lojas, DMs, onboarding e busca); administração e
 * comunidade internas seguem intactas, e a cascata institucional da Sede
 * continua descendo. Reversível a qualquer momento pela própria liderança.
 */
export async function ativarCanalRestrito(): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)
  await assertEhUnidadeDaTorcida(tenant.id)

  const estado = await getEstadoCanalRestrito(tenant.id)
  if (estado.restrito) return

  await db.$transaction([
    db.tenant.update({
      where: { id: tenant.id },
      data: {
        canalRestrito: true,
        canalRestritoDesde: new Date(),
        canalRestritoPorId: session.user.id,
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'CANAL_RESTRITO_ATIVADO',
        entidade: 'Tenant',
        entidadeId: tenant.id,
        detalhes: { restrito: true },
      },
    }),
  ])

  await propagarMudancaDeIsolamento(tenant.id)
  await notificarSedeSobreCanal(tenant.id, session.user.id, {
    tipo: 'CANAL_RESTRITO_ATIVADO',
    titulo: `${formatNomeTorcida(tenant.nome)} restringiu o canal`,
    corpo:
      'A unidade segue visível na estrutura da torcida, mas saiu da comunidade nacional e das interações externas por decisão da liderança local.',
  })
}

/** Liderança reabre o canal por conta própria — não depende de ninguém. */
export async function desativarCanalRestrito(): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)

  await reabrirCanal({
    tenantId: tenant.id,
    tenantNome: tenant.nome,
    atorId: session.user.id,
    acao: 'CANAL_RESTRITO_DESATIVADO',
    // Pedido em aberto vira APROVADA: a liderança concedeu o que a Sede pediu.
    statusSolicitacao: 'APROVADA',
    corpoNotificacao:
      'A liderança reabriu o canal. Alianças, comunidade nacional, salas, lojas e conversas voltaram a valer.',
  })
}

/** Liderança responde à solicitação da Sede: aprovar reabre; recusar mantém. */
export async function responderReativacaoCanal(formData: FormData): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)

  const aprovar = formData.get('decisao') === 'aprovar'

  const solicitacao = await getSolicitacaoRespondivel(tenant.id)
  if (!solicitacao) {
    throw new ExpectedError('Não há solicitação de reativação em aberto para responder.')
  }

  if (aprovar) {
    await reabrirCanal({
      tenantId: tenant.id,
      tenantNome: tenant.nome,
      atorId: session.user.id,
      acao: 'CANAL_REATIVACAO_APROVADA',
      statusSolicitacao: 'APROVADA',
      corpoNotificacao:
        'A liderança aprovou a reativação. O canal voltou à malha da torcida e do clube.',
    })
    return
  }

  const motivo = motivoSchema.safeParse(formData.get('motivo') ?? '')
  if (!motivo.success) {
    throw new ExpectedError(motivo.error.issues[0]?.message ?? 'Justificativa inválida.')
  }

  await db.$transaction([
    db.solicitacaoReativacaoCanal.update({
      where: { id: solicitacao.id },
      data: {
        status: 'RECUSADA',
        decididoPorId: session.user.id,
        decididoEm: new Date(),
        motivo: motivo.data,
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'CANAL_REATIVACAO_RECUSADA',
        entidade: 'SolicitacaoReativacaoCanal',
        entidadeId: solicitacao.id,
        detalhes: { motivo: motivo.data },
      },
    }),
  ])

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/sedes')
  await notificarSedeSobreCanal(tenant.id, session.user.id, {
    tipo: 'CANAL_REATIVACAO_RECUSADA',
    titulo: `${formatNomeTorcida(tenant.nome)} recusou reabrir o canal`,
    corpo: motivo.data,
    tenantDestinoId: solicitacao.solicitanteTenantId,
  })
}

// ── R5 — Convite direto ───────────────────────────────────────────────────────

/**
 * Gera (ou rotaciona) o link de convite da torcida/unidade. Rotacionar
 * invalida o link antigo na hora — é a forma de revogar um convite vazado.
 * Para unidade com canal restrito, este link é a única porta de entrada.
 */
export async function gerarConviteTenant(): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const slug = generateInviteSlug()
  await db.tenant.update({
    where: { id: tenant.id },
    data: { conviteSlug: slug, conviteAtivo: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_CONVITE_GERADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { rotacionado: true },
    },
  })

  revalidatePath('/admin/configuracoes')
}

/** Liga/desliga o convite sem trocar o slug (o link anterior volta a valer). */
export async function alternarConviteTenant(formData: FormData): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const ativo = formData.get('conviteAtivo') === 'true'
  if (ativo) {
    const atual: { conviteSlug: string | null } | null = await db.tenant.findUnique({
      where: { id: tenant.id },
      select: { conviteSlug: true },
    })
    if (!atual?.conviteSlug) {
      throw new ExpectedError('Gere um link de convite antes de ativá-lo.')
    }
  }

  await db.tenant.update({ where: { id: tenant.id }, data: { conviteAtivo: ativo } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_CONVITE_ATUALIZADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: { ativo },
    },
  })

  revalidatePath('/admin/configuracoes')
}

// ── Canal oficial (mural da unidade na Comunidade) ────────────────────────────

export async function salvarCanalOficial(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const parsed = editarCanalOficialSchema.safeParse({
    nome: String(formData.get('nome') ?? ''),
    descricao: String(formData.get('descricao') ?? '').trim() || undefined,
    visibilidadeCanal: String(formData.get('visibilidadeCanal') ?? 'HIERARQUIA'),
    somenteAdminPublica: formData.get('somenteAdminPublica') === 'true',
    publica: formData.get('publica') === 'true',
    avatarUrl: String(formData.get('avatarUrl') ?? '').trim() || undefined,
  })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const { id: canalId } = await getOrCreateCanalOficial(tenant.id, session.user.id)

  await db.conversa.update({
    where: { id: canalId },
    data: {
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      visibilidadeCanal: parsed.data.visibilidadeCanal,
      somenteAdminPublica: parsed.data.somenteAdminPublica,
      publica: parsed.data.publica,
      avatarUrl: parsed.data.avatarUrl ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CANAL_OFICIAL_ATUALIZADO',
      entidade: 'Conversa',
      entidadeId: canalId,
      detalhes: parsed.data,
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath(`/portal/comunidade/canais/${canalId}`)
  revalidatePath('/portal/comunidade/canais')
  // Avatar do canal oficial também alimenta o fallback de logo da topbar
  // (ver resolverContextoComunidade) quando a unidade não tem Tenant.logoUrl
  // nem Sede.fotoUrl — sem revalidar o layout, a topbar fica com a foto velha.
  revalidatePath('/portal', 'layout')
  invalidarCachesComunidadeFeed(tenant.id)
}

const afiliacaoSchema = z.object({
  afiliacaoId: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Afiliação inválida',
    }),
})

interface AfiliacaoLite {
  id: string
  nome: string
}

export async function salvarAfiliacao(formData: FormData): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  await assertTenantOwner(session.user.id, tenant.id)

  const parsed = afiliacaoSchema.safeParse({
    afiliacaoId: String(formData.get('afiliacaoId') ?? ''),
  })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const afiliacaoId = parsed.data.afiliacaoId
  if (afiliacaoId) {
    const afiliacao: AfiliacaoLite | null = await db.afiliacao.findUnique({
      where: { id: afiliacaoId },
      select: { id: true, nome: true },
    })
    if (!afiliacao) throw new Error('Afiliação não encontrada')
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { afiliacaoId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_AFILIACAO_ATUALIZADA',
      detalhes: { afiliacaoId },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/portal')
  invalidateTenantCache(tenant.slug)
}

// ── Cargos ────────────────────────────────────────────────────────────────────

export async function criarRole(formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const extrasRaw = formData.getAll('permissionsExtras') as string[]
  const permissionsRaw = formData.getAll('permissions') as string[]
  const { departamentoId, papelNoDepartamento } = parseDepartamentoPapel(formData)

  if (!nome) throw new Error('Nome do cargo é obrigatório')

  if (departamentoId) {
    const depto = await db.departamento.findFirst({
      where: { id: departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!depto) throw new Error('Departamento não encontrado')
  }

  const permissionsExtras = sanitizePermissionsList(extrasRaw)
  const permissions = departamentoId
    ? []
    : sanitizePermissionsList(permissionsRaw.length > 0 ? permissionsRaw : extrasRaw)

  if (!departamentoId && permissions.length === 0 && permissionsExtras.length === 0) {
    throw new Error('Selecione ao menos uma permissão ou vincule um departamento')
  }

  // Cargo novo não pode carregar permissão que o criador não tem (Achado 6).
  assertPodeDelegar(ctx, [...permissions, ...permissionsExtras], 'a um cargo')

  const existing = await db.role.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um cargo com este nome')

  await db.role.create({
    data: {
      tenantId: tenant.id,
      nome,
      cor,
      permissions,
      permissionsExtras,
      departamentoId,
      papelNoDepartamento,
      isSystem: false,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_CRIADO',
      detalhes: { nome, cor, permissions, permissionsExtras, departamentoId, papelNoDepartamento },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
}

export async function atualizarRole(roleId: string, formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const role = await db.role.findFirst({
    where: { id: roleId, tenantId: tenant.id },
  })
  if (!role) throw new Error('Cargo não encontrado')
  if (role.isSystem) throw new Error('Cargos do sistema não podem ser editados')

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const extrasRaw = formData.getAll('permissionsExtras') as string[]
  const permissionsRaw = formData.getAll('permissions') as string[]
  const { departamentoId, papelNoDepartamento } = parseDepartamentoPapel(formData)

  if (!nome) throw new Error('Nome do cargo é obrigatório')

  if (departamentoId) {
    const depto = await db.departamento.findFirst({
      where: { id: departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!depto) throw new Error('Departamento não encontrado')
  }

  const duplicado = await db.role.findFirst({
    where: { tenantId: tenant.id, nome, id: { not: roleId } },
  })
  if (duplicado) throw new Error('Já existe um cargo com este nome')

  const permissionsExtras = sanitizePermissionsList(extrasRaw)
  const permissions = departamentoId
    ? []
    : sanitizePermissionsList(permissionsRaw.length > 0 ? permissionsRaw : extrasRaw)

  if (!departamentoId && permissions.length === 0 && permissionsExtras.length === 0) {
    throw new Error('Selecione ao menos uma permissão ou vincule um departamento')
  }

  // Só o que está sendo ACRESCENTADO precisa estar ao alcance (Achado 6) —
  // senão quem não tem `settings:manage` não conseguiria nem renomear um cargo
  // que já a carrega, criado por quem podia.
  const jaTinha = new Set([...(role.permissions ?? []), ...(role.permissionsExtras ?? [])])
  const acrescentadas = [...permissions, ...permissionsExtras].filter((p) => !jaTinha.has(p))
  assertPodeDelegar(ctx, acrescentadas, 'a um cargo')

  await db.role.update({
    where: { id: roleId },
    data: {
      nome,
      cor,
      permissions,
      permissionsExtras,
      departamentoId,
      papelNoDepartamento,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_ATUALIZADO',
      entidade: 'Role',
      entidadeId: roleId,
      detalhes: {
        nome,
        cor,
        permissions,
        permissionsExtras,
        departamentoId,
        papelNoDepartamento,
        permissoesAntes: role.permissions,
        extrasAntes: role.permissionsExtras,
      },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
  return { success: true as const }
}

export async function excluirRole(roleId: string, formData?: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const role = await db.role.findFirst({
    where: { id: roleId, tenantId: tenant.id },
  })
  if (!role) throw new Error('Cargo não encontrado')
  if (role.isSystem) throw new Error('Cargos do sistema não podem ser excluídos')

  const liberarUserId = formData
    ? String(formData.get('liberarUserId') ?? '').trim() || null
    : null

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (liberarUserId) {
      await tx.userRole.deleteMany({
        where: { roleId, userId: liberarUserId, tenantId: tenant.id },
      })
      await syncMembershipFromRoles(tx, { userId: liberarUserId, tenantId: tenant.id })
    }

    const emUso = await tx.userRole.count({ where: { roleId } })
    if (emUso > 0) {
      throw new Error(
        `Este cargo está atribuído a ${emUso} outro(s) usuário(s) e não pode ser excluído.`,
      )
    }

    await tx.role.delete({ where: { id: roleId } })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'ROLE_EXCLUIDO',
        detalhes: { nome: role.nome, liberarUserId },
      },
    })
  })

  if (liberarUserId) invalidatePermissionsCache(liberarUserId, tenant.id)
  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
  return { success: true as const }
}

// ── Departamentos ─────────────────────────────────────────────────────────────
// Unidade de acesso: além do agrupamento organizacional (Diretoria, Financeiro,
// Sócio...), o departamento concede permissões aos seus membros — ver
// ARCHITECTURE.md seção 3.2b.

/**
 * Sanitiza a lista de permissões vinda do formulário de departamento:
 * descarta códigos fora do vocabulário canônico e aplica a cascata de
 * dependência (base do grupo). Diferente do cargo, um departamento PODE
 * ter zero permissões (uso apenas organizacional/escopo de gestão).
 */
function sanitizeDepartamentoPermissions(raw: string[]): string[] {
  const canonical: readonly string[] = ALL_PERMISSIONS
  const valid = raw.filter((p) => canonical.includes(p))
  const cascaded: string[] = applyPermissionCascade([], valid)
  return cascaded
}

/** Lê e valida o módulo de portal do formulário — fora do vocabulário vira null. */
function parseModuloPortal(formData: FormData): string | null {
  const raw = String(formData.get('moduloPortal') ?? '').trim()
  if (!raw) return null
  return DEPARTAMENTO_MODULOS.some((m) => m.key === raw) ? raw : null
}

/**
 * Gera um slug único por tenant a partir do nome do departamento,
 * anexando sufixo numérico (-2, -3...) em caso de colisão.
 */
async function gerarSlugUnico(
  tenantId: string,
  nome: string,
  ignorarId?: string,
): Promise<string> {
  const base = slugifyDepartamento(nome) || 'departamento'
  let slug = base
  let sufixo = 2
  // Loop limitado na prática: colide só se já existirem N departamentos homônimos
  for (;;) {
    const existente: { id: string } | null = await db.departamento.findFirst({
      where: {
        tenantId,
        slug,
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { id: true },
    })
    if (!existente) return slug
    slug = `${base}-${sufixo}`
    sufixo += 1
  }
}

interface MembroDepartamentoLite {
  userId: string
}

export async function criarDepartamento(formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const permissionsRaw = formData.getAll('permissions') as string[]
  const permissionsGestorRaw = formData.getAll('permissionsGestor') as string[]
  const moduloPortal = parseModuloPortal(formData)

  if (!nome) throw new Error('Nome do departamento é obrigatório')
  if (isDepartamentoLegado({ nome, slug: slugifyDepartamento(nome) })) {
    throw new Error('Torcedor e Sócio são tipos de membro, não departamentos')
  }

  const permissions = sanitizeDepartamentoPermissions(permissionsRaw)
  const permissionsGestor = sanitizeDepartamentoPermissions([
    ...permissions,
    ...permissionsGestorRaw,
  ]).filter((p) => !permissions.includes(p))

  // O pacote do departamento vira o cargo `Membro · X` / `Gestor · X`, que é
  // atribuível — mesmo vetor de escalada de `criarRole` (Achado 6).
  assertPodeDelegar(ctx, [...permissions, ...permissionsGestor], 'a um departamento')

  const existing = await db.departamento.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um departamento com este nome')

  const slug = await gerarSlugUnico(tenant.id, nome)

  await db.departamento.create({
    data: {
      tenantId: tenant.id,
      nome,
      cor,
      slug,
      moduloPortal,
      permissions,
      permissionsGestor,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_CRIADO',
      detalhes: { nome, cor, slug, moduloPortal, permissions, permissionsGestor },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos')
}

export async function atualizarDepartamento(departamentoId: string, formData: FormData) {
  const ctx = await assertPermission(PERMISSIONS.ROLES_MANAGE)
  const { session, tenant } = ctx

  const departamento = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const permissionsRaw = formData.getAll('permissions') as string[]
  const permissionsGestorRaw = formData.getAll('permissionsGestor') as string[]
  const moduloPortal = parseModuloPortal(formData)

  if (!nome) throw new Error('Nome do departamento é obrigatório')
  if (isDepartamentoLegado({ nome, slug: slugifyDepartamento(nome) })) {
    throw new Error('Torcedor e Sócio são tipos de membro, não departamentos')
  }

  const permissions = sanitizeDepartamentoPermissions(permissionsRaw)
  const permissionsGestor = sanitizeDepartamentoPermissions([
    ...permissions,
    ...permissionsGestorRaw,
  ]).filter((p) => !permissions.includes(p))

  // Idem `atualizarRole`: só o acréscimo precisa estar ao alcance (Achado 6).
  const jaTinha = new Set([
    ...(departamento.permissions ?? []),
    ...(departamento.permissionsGestor ?? []),
  ])
  assertPodeDelegar(
    ctx,
    [...permissions, ...permissionsGestor].filter((p) => !jaTinha.has(p)),
    'a um departamento',
  )

  // Regenera o slug só quando o nome mudou — mantém URLs/referências estáveis
  const slug =
    nome === departamento.nome
      ? departamento.slug
      : await gerarSlugUnico(tenant.id, nome, departamentoId)

  await db.departamento.update({
    where: { id: departamentoId },
    data: { nome, cor, slug, moduloPortal, permissions, permissionsGestor },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_ATUALIZADO',
      entidade: 'Departamento',
      entidadeId: departamentoId,
      detalhes: {
        nome,
        cor,
        slug,
        moduloPortal,
        permissions,
        permissionsGestor,
        permissoesAntes: departamento.permissions,
        permissoesGestorAntes: departamento.permissionsGestor,
      },
    },
  })

  // Mudar as permissões do departamento muda as efetivas de membros e gestores
  const [membros, gestores]: [MembroDepartamentoLite[], MembroDepartamentoLite[]] = await Promise.all([
    db.userDepartamento.findMany({
      where: { departamentoId },
      select: { userId: true },
    }),
    db.departamentoGestor.findMany({
      where: { departamentoId },
      select: { userId: true },
    }),
  ])
  const afetados = new Set([...membros, ...gestores].map((m) => m.userId))
  for (const userId of afetados) {
    invalidatePermissionsCache(userId, tenant.id)
  }

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos')
}

export async function excluirDepartamento(departamentoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const departamento = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  // Membros perdem as permissões concedidas pelo departamento — capturar antes do delete
  const membros: MembroDepartamentoLite[] = await db.userDepartamento.findMany({
    where: { departamentoId },
    select: { userId: true },
  })

  await db.departamento.delete({ where: { id: departamentoId } })

  for (const membro of membros) {
    invalidatePermissionsCache(membro.userId, tenant.id)
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_EXCLUIDO',
      detalhes: { nome: departamento.nome },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
}
