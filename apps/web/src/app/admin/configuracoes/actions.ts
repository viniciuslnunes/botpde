'use server'

import { revalidatePath } from 'next/cache'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { invalidatePermissionsCache, invalidateTenantCache } from '@/lib/tenant'
import {
  ALL_PERMISSIONS,
  applyPermissionCascade,
  DEPARTAMENTO_MODULOS,
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

async function assertTenantOwner(userId: string, tenantId: string): Promise<void> {
  const ownerRole = await db.userRole.findFirst({
    where: {
      userId,
      tenantId,
      role: { isSystem: true, nome: 'owner' },
    },
    select: { id: true },
  })
  if (!ownerRole) throw new Error('Apenas o owner pode alterar esta configuração')
}

// ── Perfil do tenant ──────────────────────────────────────────────────────────

export async function salvarPerfilTenant(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const nome = String(formData.get('nome') ?? '').trim()
  const corPrimaria = String(formData.get('corPrimaria') ?? '').trim()

  if (!nome) throw new Error('Nome é obrigatório')
  if (!/^#[0-9a-fA-F]{6}$/.test(corPrimaria)) throw new Error('Cor inválida')

  await db.tenant.update({
    where: { id: tenant.id },
    data: { nome, corPrimaria },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_PERFIL_ATUALIZADO',
      detalhes: { nome, corPrimaria },
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
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos')

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
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

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
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

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
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const permissionsRaw = formData.getAll('permissions') as string[]
  const permissionsGestorRaw = formData.getAll('permissionsGestor') as string[]
  const moduloPortal = parseModuloPortal(formData)

  if (!nome) throw new Error('Nome do departamento é obrigatório')

  const permissions = sanitizeDepartamentoPermissions(permissionsRaw)
  const permissionsGestor = sanitizeDepartamentoPermissions([
    ...permissions,
    ...permissionsGestorRaw,
  ]).filter((p) => !permissions.includes(p))

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
}

export async function atualizarDepartamento(departamentoId: string, formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

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

  const permissions = sanitizeDepartamentoPermissions(permissionsRaw)
  const permissionsGestor = sanitizeDepartamentoPermissions([
    ...permissions,
    ...permissionsGestorRaw,
  ]).filter((p) => !permissions.includes(p))

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
