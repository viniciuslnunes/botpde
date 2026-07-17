'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  canManageDepartamento,
  hasPermission,
  mergeBarracaoItem,
  BARRACAO_CHECKLIST,
  PERMISSIONS,
} from '@torcida/types'
import {
  adicionarMembroDepartamento,
  removerMembroDepartamento,
} from '@/app/admin/acessos/actions'

const IdSchema = z.string().min(1)

export type ActionState = { ok?: boolean; error?: string }

async function assertPodeGerirArea(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (hasPermission(effective, PERMISSIONS.ROLES_MANAGE)) {
    return { session, tenant }
  }

  const gestao: Array<{ departamentoId: string }> = await db.departamentoGestor.findMany({
    where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
    select: { departamentoId: true },
  })
  if (!canManageDepartamento(effective, gestao.map((g) => g.departamentoId), departamentoId)) {
    throw new Error('Sem permissão')
  }

  return { session, tenant }
}

export async function adicionarMembroArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const departamentoId = IdSchema.safeParse(formData.get('departamentoId'))
  const targetUserId = IdSchema.safeParse(formData.get('targetUserId'))
  const slug = IdSchema.safeParse(formData.get('slug'))
  if (!departamentoId.success || !targetUserId.success) {
    return { error: 'Dados inválidos' }
  }

  try {
    await adicionarMembroDepartamento(departamentoId.data, targetUserId.data)
    if (slug.success) revalidatePath(`/portal/departamentos/${slug.data}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível adicionar' }
  }
}

export async function removerMembroArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const departamentoId = IdSchema.safeParse(formData.get('departamentoId'))
  const targetUserId = IdSchema.safeParse(formData.get('targetUserId'))
  const slug = IdSchema.safeParse(formData.get('slug'))
  if (!departamentoId.success || !targetUserId.success) {
    return { error: 'Dados inválidos' }
  }

  try {
    await removerMembroDepartamento(departamentoId.data, targetUserId.data)
    if (slug.success) revalidatePath(`/portal/departamentos/${slug.data}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível remover' }
  }
}

/** Candidatos aprovados do tenant ainda fora do departamento (busca por nome/email/@). */
export async function buscarCandidatosArea(
  departamentoId: string,
  query: string,
): Promise<Array<{ id: string; nome: string | null; email: string; nickname: string | null }>> {
  const q = query.trim()
  if (q.length < 2) return []

  try {
    await assertPodeGerirArea(departamentoId)
  } catch {
    return []
  }

  const depto: { id: string; tenantId: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId },
    select: { id: true, tenantId: true },
  })
  if (!depto) return []

  const jaNoDepto: Array<{ userId: string }> = await db.userDepartamento.findMany({
    where: { departamentoId, tenantId: depto.tenantId },
    select: { userId: true },
  })
  const excluir = new Set(jaNoDepto.map((m) => m.userId))

  const membros: Array<{
    user: { id: string; nome: string | null; email: string; nickname: string | null }
  }> = await db.saasMembro.findMany({
    where: {
      tenantId: depto.tenantId,
      status: 'APROVADO',
      user: {
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
        ],
      },
    },
    take: 12,
    select: {
      user: { select: { id: true, nome: true, email: true, nickname: true } },
    },
  })

  return membros.map((m) => m.user).filter((u) => !excluir.has(u.id))
}

const CanalLinkSchema = z.object({
  departamentoId: z.string().min(1),
  slug: z.string().min(1),
  conversaId: z.string().uuid().nullable(),
})

/** Vincula (ou remove) o canal oficial da área. */
export async function vincularCanalArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawConversa = formData.get('conversaId')
  const parsed = CanalLinkSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    conversaId:
      rawConversa === null || rawConversa === '' || rawConversa === '__none__'
        ? null
        : rawConversa,
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)

    const depto: { id: string; tenantId: string } | null = await db.departamento.findFirst({
      where: { id: parsed.data.departamentoId, tenantId: tenant.id },
      select: { id: true, tenantId: true },
    })
    if (!depto) return { error: 'Departamento não encontrado' }

    if (parsed.data.conversaId) {
      const canal: { id: string } | null = await db.conversa.findFirst({
        where: {
          id: parsed.data.conversaId,
          tenantId: tenant.id,
          tipo: 'CANAL',
        },
        select: { id: true },
      })
      if (!canal) return { error: 'Canal inválido' }
    }

    await db.departamento.update({
      where: { id: depto.id },
      data: { canalConversaId: parsed.data.conversaId },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_CANAL_VINCULADO',
        entidade: 'Departamento',
        entidadeId: depto.id,
        detalhes: { conversaId: parsed.data.conversaId },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível vincular o canal' }
  }
}

const BarracaoToggleSchema = z.object({
  departamentoId: z.string().min(1),
  slug: z.string().min(1),
  itemId: z.string().min(1).max(64),
  done: z.enum(['true', 'false']),
})

/** Marca item do checklist do barracão (Carnaval). */
export async function toggleBarracaoItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = BarracaoToggleSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    itemId: formData.get('itemId'),
    done: formData.get('done'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)

    if (!BARRACAO_CHECKLIST.some((i) => i.id === parsed.data.itemId)) {
      return { error: 'Item inválido' }
    }

    const depto: { id: string; meta: unknown } | null = await db.departamento.findFirst({
      where: { id: parsed.data.departamentoId, tenantId: tenant.id },
      select: { id: true, meta: true },
    })
    if (!depto) return { error: 'Departamento não encontrado' }

    const nextMeta = mergeBarracaoItem(
      depto.meta,
      parsed.data.itemId,
      parsed.data.done === 'true',
    )

    await db.departamento.update({
      where: { id: depto.id },
      data: { meta: nextMeta },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_BARRACAO_ITEM',
        entidade: 'Departamento',
        entidadeId: depto.id,
        detalhes: { itemId: parsed.data.itemId, done: parsed.data.done === 'true' },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar' }
  }
}
