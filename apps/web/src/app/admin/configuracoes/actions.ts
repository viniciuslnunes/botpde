'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'

async function assertOwner() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

  const ownerRole = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: 'owner' },
    },
  })

  if (!ownerRole) throw new Error('Apenas o owner pode alterar configurações')

  return { session, tenant }
}

async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

  const role = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
    },
  })

  if (!role) throw new Error('Sem permissão')

  return { session, tenant }
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

  const existing = await db.role.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um cargo com este nome')

  await db.role.create({
    data: {
      tenantId: tenant.id,
      nome,
      cor,
      permissions: permissionsRaw,
      isSystem: false,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_CRIADO',
      detalhes: { nome, cor, permissions: permissionsRaw },
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

  await db.role.update({
    where: { id: roleId },
    data: { nome, cor, permissions: permissionsRaw },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ROLE_ATUALIZADO',
      entidade: 'Role',
      entidadeId: roleId,
      detalhes: { nome, cor, permissions: permissionsRaw },
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
