'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertAdmin, assertOwner } from '@/lib/authz'
import { ALL_PERMISSIONS, applyPermissionCascade } from '@torcida/types'

/**
 * Sanitiza a lista de permissões vinda do formulário de cargo:
 * descarta códigos fora do vocabulário canônico, aplica a cascata de
 * dependência (base do grupo) e exige ao menos uma permissão.
 */
function sanitizeRolePermissions(permissionsRaw: string[]): string[] {
  const canonical: readonly string[] = ALL_PERMISSIONS
  const valid = permissionsRaw.filter((p) => canonical.includes(p))
  const cascaded: string[] = applyPermissionCascade([], valid)
  if (cascaded.length === 0) throw new Error('Selecione ao menos uma permissão para o cargo')
  return cascaded
}

// ── Perfil do tenant ──────────────────────────────────────────────────────────

export async function salvarPerfilTenant(formData: FormData) {
  const { session, tenant } = await assertOwner()

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
}

export async function salvarDiscordGuildId(formData: FormData) {
  const { session, tenant } = await assertOwner()

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
}

// ── Cargos ────────────────────────────────────────────────────────────────────

export async function criarRole(formData: FormData) {
  const { session, tenant } = await assertAdmin()

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const permissionsRaw = formData.getAll('permissions') as string[]

  if (!nome) throw new Error('Nome do cargo é obrigatório')

  const permissions = sanitizeRolePermissions(permissionsRaw)

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
      isSystem: false,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_CRIADO',
      detalhes: { nome, cor, permissions },
    },
  })

  revalidatePath('/admin/configuracoes')
}

export async function atualizarRole(roleId: string, formData: FormData) {
  const { session, tenant } = await assertAdmin()

  const role = await db.role.findFirst({
    where: { id: roleId, tenantId: tenant.id },
  })
  if (!role) throw new Error('Cargo não encontrado')
  if (role.isSystem) throw new Error('Cargos do sistema não podem ser editados')

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const permissionsRaw = formData.getAll('permissions') as string[]

  if (!nome) throw new Error('Nome do cargo é obrigatório')

  const duplicado = await db.role.findFirst({
    where: { tenantId: tenant.id, nome, id: { not: roleId } },
  })
  if (duplicado) throw new Error('Já existe um cargo com este nome')

  const permissions = sanitizeRolePermissions(permissionsRaw)

  await db.role.update({
    where: { id: roleId },
    data: { nome, cor, permissions },
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
        permissoesAntes: role.permissions,
      },
    },
  })

  revalidatePath('/admin/configuracoes')
}

export async function excluirRole(roleId: string) {
  const { session, tenant } = await assertAdmin()

  const role = await db.role.findFirst({
    where: { id: roleId, tenantId: tenant.id },
  })
  if (!role) throw new Error('Cargo não encontrado')
  if (role.isSystem) throw new Error('Cargos do sistema não podem ser excluídos')

  // Cargo em uso não pode ser excluído — remova-o dos usuários primeiro
  const emUso = await db.userRole.count({ where: { roleId } })
  if (emUso > 0) {
    throw new Error(
      `Este cargo está atribuído a ${emUso} usuário(s) e não pode ser excluído. Remova-o dos usuários em Controle de acesso primeiro.`,
    )
  }

  await db.role.delete({ where: { id: roleId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_EXCLUIDO',
      detalhes: { nome: role.nome },
    },
  })

  revalidatePath('/admin/configuracoes')
}

// ── Departamentos ─────────────────────────────────────────────────────────────
// Agrupamento organizacional (Diretoria, Dpto. Financeiro, Sócio...), separado
// de cargo/perfil — ver ARCHITECTURE.md seção 3.2b.

export async function criarDepartamento(formData: FormData) {
  const { session, tenant } = await assertAdmin()

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()

  if (!nome) throw new Error('Nome do departamento é obrigatório')

  const existing = await db.departamento.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um departamento com este nome')

  await db.departamento.create({
    data: { tenantId: tenant.id, nome, cor },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_CRIADO',
      detalhes: { nome, cor },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
}

export async function atualizarDepartamento(departamentoId: string, formData: FormData) {
  const { session, tenant } = await assertAdmin()

  const departamento = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()

  if (!nome) throw new Error('Nome do departamento é obrigatório')

  await db.departamento.update({
    where: { id: departamentoId },
    data: { nome, cor },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_ATUALIZADO',
      entidade: 'Departamento',
      entidadeId: departamentoId,
      detalhes: { nome, cor },
    },
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/acessos')
}

export async function excluirDepartamento(departamentoId: string) {
  const { session, tenant } = await assertAdmin()

  const departamento = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  await db.departamento.delete({ where: { id: departamentoId } })

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
