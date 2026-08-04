'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, ensureCanalArea, syncMembrosCanalArea, syncMembrosCanalDepartamento } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import {
  addAreaChecklistItem,
  applyAreaChecklistModelo,
  calculateEffectivePermissions,
  canManageDepartamento,
  hasPermission,
  isDepartamentoLegado,
  isMembroElegivelDepartamento,
  mergeBarracaoItem,
  mergeDesfileEm,
  newAreaChecklistItemId,
  removeAreaChecklistItem,
  slugifyArea,
  toggleAreaChecklistItem as mergeAreaChecklistToggle,
  validarVinculoCanalArea,
  BARRACAO_CHECKLIST,
  PERMISSIONS,
} from '@torcida/types'
import {
  adicionarMembroDepartamento,
  removerMembroDepartamento,
} from '@/app/admin/(plataforma)/acessos/actions'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'

const IdSchema = z.string().min(1)
const CorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
const BuscarCandidatosSchema = z.object({
  departamentoId: IdSchema,
  query: z.string().trim().min(2),
})

export type ActionState = { ok?: boolean; error?: string }

async function assertPodeGerirArea(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Não autorizado')

  // Super-admin sem cargo no tenant: só leitura (hub/cockpit). Dual-hat
  // (SA + roles:manage / gestor) passa pelo RBAC abaixo.
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

/** Atualiza só a cor do ícone da área (hub / portal). */
export async function atualizarCorDepartamento(
  departamentoId: string,
  cor: string,
): Promise<void> {
  const idParsed = IdSchema.safeParse(departamentoId)
  const corParsed = CorSchema.safeParse(cor)
  if (!idParsed.success || !corParsed.success) {
    throw new Error('Dados inválidos')
  }

  const { session, tenant } = await assertPodeGerirArea(idParsed.data)

  const depto: { id: string; slug: string; nome: string; cor: string } | null =
    await db.departamento.findFirst({
      where: { id: idParsed.data, tenantId: tenant.id },
      select: { id: true, slug: true, nome: true, cor: true },
    })
  if (!depto) throw new Error('Departamento não encontrado')
  if (isDepartamentoLegado(depto)) {
    throw new Error('Torcedor e Sócio não são departamentos')
  }

  await db.departamento.update({
    where: { id: depto.id },
    data: { cor: corParsed.data },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'DEPARTAMENTO_COR_ATUALIZADA',
      entidade: 'Departamento',
      entidadeId: depto.id,
      detalhes: { corAntes: depto.cor, cor: corParsed.data, slug: depto.slug },
    },
  })

  revalidatePath('/portal/departamentos')
  revalidatePath(`/portal/departamentos/${depto.slug}`)
  revalidatePath('/admin/acessos')
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
  const entrada = BuscarCandidatosSchema.safeParse({ departamentoId, query })
  if (!entrada.success) return []
  const q = entrada.data.query
  let tenantId: string

  try {
    const { tenant } = await assertPodeGerirArea(entrada.data.departamentoId)
    tenantId = tenant.id
  } catch {
    return []
  }

  const depto: { id: string; tenantId: string } | null = await db.departamento.findFirst({
    where: { id: entrada.data.departamentoId, tenantId },
    select: { id: true, tenantId: true },
  })
  if (!depto) return []

  const jaNoDepto: Array<{ userId: string }> = await db.userDepartamento.findMany({
    where: { departamentoId: depto.id, tenantId: depto.tenantId },
    select: { userId: true },
  })
  const excluir = new Set(jaNoDepto.map((m) => m.userId))

  const membros: Array<{
    user: { id: string; nome: string | null; email: string; nickname: string | null }
  }> = await db.saasMembro.findMany({
    where: {
      tenantId: depto.tenantId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      espelhado: false,
      membroOrigemId: null,
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

      const [areaDona, sedeDona]: [{ id: string } | null, { id: string } | null] = await Promise.all([
        db.departamentoArea.findFirst({
          where: { canalConversaId: canal.id },
          select: { id: true },
        }),
        db.sede.findFirst({
          where: { canalConversaId: canal.id },
          select: { id: true },
        }),
      ])
      if (sedeDona) return { error: 'Este canal já é o canal oficial de uma unidade.' }
      if (areaDona) return { error: 'Este canal já está vinculado a uma área de atuação.' }
    }

    await db.departamento.update({
      where: { id: depto.id },
      data: { canalConversaId: parsed.data.conversaId },
    })

    if (parsed.data.conversaId) {
      await syncMembrosCanalDepartamento(db, depto.id)
    }

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
    revalidatePath('/admin/carnaval')
    const { invalidateAdminDirecao } = await import('@/lib/admin-direcao-cache')
    invalidateAdminDirecao(tenant.id)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar' }
  }
}

const DesfileEmSchema = z.object({
  departamentoId: z.string().min(1),
  slug: z.string().min(1),
  desfileEm: z.string().max(32).optional(),
})

/** Define a data do desfile (meta.desfileEm) para urgência do barracão. */
export async function salvarDesfileEm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = DesfileEmSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    desfileEm: formData.get('desfileEm') || undefined,
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)

    const iso = parsed.data.desfileEm?.trim() || null
    if (iso) {
      const d = new Date(iso)
      if (!Number.isFinite(d.getTime())) return { error: 'Data inválida' }
    }

    const depto: { id: string; meta: unknown } | null = await db.departamento.findFirst({
      where: { id: parsed.data.departamentoId, tenantId: tenant.id },
      select: { id: true, meta: true },
    })
    if (!depto) return { error: 'Departamento não encontrado' }

    const nextMeta = mergeDesfileEm(depto.meta, iso)

    await db.departamento.update({
      where: { id: depto.id },
      data: { meta: nextMeta },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_DESFILE_EM',
        entidade: 'Departamento',
        entidadeId: depto.id,
        detalhes: { desfileEm: iso },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    revalidatePath('/admin/carnaval')
    const { invalidateAdminDirecao } = await import('@/lib/admin-direcao-cache')
    invalidateAdminDirecao(tenant.id)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível salvar a data' }
  }
}

// ---------------------------------------------------------------------------
// Áreas de atuação (`DepartamentoArea`) — organizam gente e trabalho dentro do
// departamento; NÃO concedem permissão (RBAC continua no Departamento). Todas
// usam `assertPodeGerirArea` e nunca confiam no id vindo do cliente: a área é
// sempre revalidada contra `departamentoId` + `tenant.id`.
// ---------------------------------------------------------------------------

const BooleanFlagSchema = z.preprocess(
  (v) => v === 'on' || v === 'true' || v === true,
  z.boolean(),
)

const AreaCriarSchema = z.object({
  departamentoId: IdSchema,
  slug: IdSchema,
  nome: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  descricao: z.string().trim().max(500, 'Descrição muito longa').optional().or(z.literal('')),
  sazonal: BooleanFlagSchema,
})

const AreaAtualizarSchema = AreaCriarSchema.extend({
  areaId: IdSchema,
})

const AreaArquivarSchema = z.object({
  areaId: IdSchema,
  departamentoId: IdSchema,
  slug: IdSchema,
  ativa: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

const AreaMembroSchema = z.object({
  areaId: IdSchema,
  departamentoId: IdSchema,
  slug: IdSchema,
  targetUserId: IdSchema,
})

const AreaResponsavelSchema = AreaMembroSchema.extend({
  papel: z.enum(['MEMBRO', 'RESPONSAVEL']),
})

type AreaEscopo = {
  id: string
  nome: string
  slug: string
  ativa: boolean
  meta: unknown
}

/** A área pertence ao departamento e ao tenant ativo — nunca confiar no cliente. */
async function assertAreaNoDepartamento(
  tenantId: string,
  departamentoId: string,
  areaId: string,
): Promise<AreaEscopo> {
  const area: AreaEscopo | null = await db.departamentoArea.findFirst({
    where: { id: areaId, departamentoId, tenantId },
    select: { id: true, nome: true, slug: true, ativa: true, meta: true },
  })
  if (!area) throw new Error('Área não encontrada')
  return area
}

/**
 * Só entra em `DepartamentoAreaMembro` quem já tem membership em vigor no
 * departamento pai e continua elegível como sócio (SOCIO/APROVADO/ativo/não
 * espelhado/sem origem). Sair do departamento — ou deixar de ser elegível —
 * derruba a possibilidade de entrar em áreas dele.
 */
async function assertElegivelParaArea(
  tenantId: string,
  departamentoId: string,
  targetUserId: string,
): Promise<void> {
  const efetivadas = await getAreasEfetivadasPorUser(tenantId, [targetUserId])
  if (!efetivadas.get(targetUserId)?.has(departamentoId)) {
    throw new Error('A pessoa precisa estar no departamento antes de entrar em uma área')
  }

  type SaasMembroLite = {
    tenantId: string
    tipo: string
    status: string
    desligadoEm: Date | null
    espelhado: boolean
    membroOrigemId: string | null
  }
  const membro: SaasMembroLite | null = await db.saasMembro.findFirst({
    where: { tenantId, userId: targetUserId },
    select: {
      tenantId: true,
      tipo: true,
      status: true,
      desligadoEm: true,
      espelhado: true,
      membroOrigemId: true,
    },
  })
  if (!isMembroElegivelDepartamento(membro, tenantId)) {
    throw new Error('Sócio não está mais elegível para áreas neste departamento')
  }
}

export async function criarAreaDepartamento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaCriarSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    nome: formData.get('nome'),
    descricao: formData.get('descricao'),
    sazonal: formData.get('sazonal'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)

    const depto: { id: string } | null = await db.departamento.findFirst({
      where: { id: parsed.data.departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!depto) return { error: 'Departamento não encontrado' }

    const slugArea = slugifyArea(parsed.data.nome)
    const existente: { id: string } | null = await db.departamentoArea.findFirst({
      where: { departamentoId: depto.id, slug: slugArea },
      select: { id: true },
    })
    if (existente) return { error: 'Já existe uma área com esse nome neste departamento.' }

    const ultimaOrdem: { ordem: number } | null = await db.departamentoArea.findFirst({
      where: { departamentoId: depto.id },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    })

    const area = await db.departamentoArea.create({
      data: {
        tenantId: tenant.id,
        departamentoId: depto.id,
        nome: parsed.data.nome,
        slug: slugArea,
        descricao: parsed.data.descricao || null,
        sazonal: parsed.data.sazonal,
        ordem: (ultimaOrdem?.ordem ?? -1) + 1,
      },
    })

    await ensureCanalArea(db, area.id, { criadoPorId: session.user.id })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_CRIADA',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { nome: area.nome, slug: area.slug, departamentoId: depto.id },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível criar a área' }
  }
}

export async function atualizarAreaDepartamento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaAtualizarSchema.safeParse({
    areaId: formData.get('areaId'),
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    nome: formData.get('nome'),
    descricao: formData.get('descricao'),
    sazonal: formData.get('sazonal'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )

    const novoSlug = slugifyArea(parsed.data.nome)
    if (novoSlug !== area.slug) {
      const colisao: { id: string } | null = await db.departamentoArea.findFirst({
        where: {
          departamentoId: parsed.data.departamentoId,
          slug: novoSlug,
          id: { not: area.id },
        },
        select: { id: true },
      })
      if (colisao) return { error: 'Já existe uma área com esse nome neste departamento.' }
    }

    await db.departamentoArea.update({
      where: { id: area.id },
      data: {
        nome: parsed.data.nome,
        slug: novoSlug,
        descricao: parsed.data.descricao || null,
        sazonal: parsed.data.sazonal,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_ATUALIZADA',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { nomeAntes: area.nome, nome: parsed.data.nome },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar a área' }
  }
}

/** Arquiva (soft) ou reativa a área — nunca deleta. */
export async function arquivarAreaDepartamento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaArquivarSchema.safeParse({
    areaId: formData.get('areaId'),
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    ativa: formData.get('ativa'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )

    await db.departamentoArea.update({
      where: { id: area.id },
      data: { ativa: parsed.data.ativa },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_ARQUIVADA',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { nome: area.nome, ativa: parsed.data.ativa },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar a área' }
  }
}

export async function adicionarMembroAreaDepartamento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaMembroSchema.safeParse({
    areaId: formData.get('areaId'),
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    targetUserId: formData.get('targetUserId'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )
    await assertElegivelParaArea(tenant.id, parsed.data.departamentoId, parsed.data.targetUserId)

    await db.departamentoAreaMembro.upsert({
      where: {
        areaId_userId: { areaId: area.id, userId: parsed.data.targetUserId },
      },
      create: { areaId: area.id, userId: parsed.data.targetUserId },
      update: {},
    })

    await syncMembrosCanalArea(db, area.id)

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_MEMBRO_ADICIONADO',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { userId: parsed.data.targetUserId },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível incluir na área' }
  }
}

export async function removerMembroAreaDepartamento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaMembroSchema.safeParse({
    areaId: formData.get('areaId'),
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    targetUserId: formData.get('targetUserId'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )

    await db.departamentoAreaMembro.deleteMany({
      where: { areaId: area.id, userId: parsed.data.targetUserId },
    })

    await syncMembrosCanalArea(db, area.id)

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_MEMBRO_REMOVIDO',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { userId: parsed.data.targetUserId },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível remover da área' }
  }
}

export async function definirResponsavelArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaResponsavelSchema.safeParse({
    areaId: formData.get('areaId'),
    departamentoId: formData.get('departamentoId'),
    slug: formData.get('slug'),
    targetUserId: formData.get('targetUserId'),
    papel: formData.get('papel'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )

    const vinculo: { id: string } | null = await db.departamentoAreaMembro.findFirst({
      where: { areaId: area.id, userId: parsed.data.targetUserId },
      select: { id: true },
    })
    if (!vinculo) return { error: 'A pessoa precisa estar na área antes de virar responsável' }

    await db.departamentoAreaMembro.update({
      where: { id: vinculo.id },
      data: { papel: parsed.data.papel },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_AREA_RESPONSAVEL_DEFINIDO',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { userId: parsed.data.targetUserId, papel: parsed.data.papel },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar' }
  }
}

/** Candidatos do departamento (já elegíveis) ainda fora desta área específica. */
export async function buscarCandidatosParaArea(
  areaId: string,
  departamentoId: string,
  query: string,
): Promise<Array<{ id: string; nome: string | null; email: string; nickname: string | null }>> {
  const entrada = z
    .object({ areaId: IdSchema, departamentoId: IdSchema, query: z.string().trim().min(2) })
    .safeParse({ areaId, departamentoId, query })
  if (!entrada.success) return []

  let tenantId: string
  try {
    const { tenant } = await assertPodeGerirArea(entrada.data.departamentoId)
    tenantId = tenant.id
  } catch {
    return []
  }

  const area: { id: string } | null = await db.departamentoArea.findFirst({
    where: { id: entrada.data.areaId, departamentoId: entrada.data.departamentoId, tenantId },
    select: { id: true },
  })
  if (!area) return []

  const q = entrada.data.query
  const jaNaArea: Array<{ userId: string }> = await db.departamentoAreaMembro.findMany({
    where: { areaId: area.id },
    select: { userId: true },
  })
  const excluir = new Set(jaNaArea.map((m) => m.userId))

  const membrosDepto: Array<{
    user: { id: string; nome: string | null; email: string; nickname: string | null }
  }> = await db.userDepartamento.findMany({
    where: {
      departamentoId: entrada.data.departamentoId,
      tenantId,
      user: {
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
        ],
      },
    },
    take: 12,
    select: { user: { select: { id: true, nome: true, email: true, nickname: true } } },
  })

  return membrosDepto.map((m) => m.user).filter((u) => !excluir.has(u.id))
}

// ---------------------------------------------------------------------------
// Checklist da área (`DepartamentoArea.meta.checklist`) — leve, sem ERP.
// ---------------------------------------------------------------------------

const AreaChecklistToggleSchema = z.object({
  departamentoId: IdSchema,
  areaId: IdSchema,
  slug: z.string().min(1),
  itemId: z.string().min(1).max(64),
  done: z.enum(['true', 'false']),
})

export async function toggleChecklistItemArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaChecklistToggleSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    areaId: formData.get('areaId'),
    slug: formData.get('slug'),
    itemId: formData.get('itemId'),
    done: formData.get('done'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )
    const nextMeta = mergeAreaChecklistToggle(
      area.meta,
      parsed.data.itemId,
      parsed.data.done === 'true',
    )
    await db.departamentoArea.update({
      where: { id: area.id },
      data: { meta: nextMeta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'AREA_CHECKLIST_ITEM',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: {
          itemId: parsed.data.itemId,
          done: parsed.data.done === 'true',
          area: area.nome,
        },
      },
    })
    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível atualizar' }
  }
}

const AreaChecklistAddSchema = z.object({
  departamentoId: IdSchema,
  areaId: IdSchema,
  slug: z.string().min(1),
  label: z.string().trim().min(2).max(80),
})

export async function adicionarChecklistItemArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaChecklistAddSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    areaId: formData.get('areaId'),
    slug: formData.get('slug'),
    label: formData.get('label'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )
    const itemId = newAreaChecklistItemId(parsed.data.label)
    const result = addAreaChecklistItem(area.meta, parsed.data.label, itemId)
    if ('error' in result) return { error: result.error }

    await db.departamentoArea.update({
      where: { id: area.id },
      data: { meta: result.meta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'AREA_CHECKLIST_ADD',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { itemId: result.item.id, label: result.item.label, area: area.nome },
      },
    })
    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível adicionar' }
  }
}

const AreaChecklistRemoveSchema = z.object({
  departamentoId: IdSchema,
  areaId: IdSchema,
  slug: z.string().min(1),
  itemId: z.string().min(1).max(64),
})

export async function removerChecklistItemArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaChecklistRemoveSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    areaId: formData.get('areaId'),
    slug: formData.get('slug'),
    itemId: formData.get('itemId'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )
    const nextMeta = removeAreaChecklistItem(area.meta, parsed.data.itemId)
    await db.departamentoArea.update({
      where: { id: area.id },
      data: { meta: nextMeta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'AREA_CHECKLIST_REMOVE',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: { itemId: parsed.data.itemId, area: area.nome },
      },
    })
    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível remover' }
  }
}

const AreaChecklistModeloSchema = z.object({
  departamentoId: IdSchema,
  areaId: IdSchema,
  slug: z.string().min(1),
})

/** Acrescenta itens do modelo sugerido pelo slug da área (não apaga os existentes). */
export async function aplicarModeloChecklistArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = AreaChecklistModeloSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    areaId: formData.get('areaId'),
    slug: formData.get('slug'),
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )
    const result = applyAreaChecklistModelo(area.meta, area.slug)
    if ('error' in result) return { error: result.error }

    await db.departamentoArea.update({
      where: { id: area.id },
      data: { meta: result.meta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'AREA_CHECKLIST_MODELO',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: {
          area: area.nome,
          areaSlug: area.slug,
          adicionados: result.adicionados,
        },
      },
    })
    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível aplicar o modelo' }
  }
}

const CanalAreaLinkSchema = z.object({
  departamentoId: IdSchema,
  areaId: IdSchema,
  slug: z.string().min(1),
  conversaId: z.string().uuid().nullable(),
})

/**
 * Vincula (ou remove) canal da frente. Manual — nunca cria Conversa.
 * Recusa se o canal já for de sede, departamento ou outra área.
 */
export async function vincularCanalDepartamentoArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawConversa = formData.get('conversaId')
  const parsed = CanalAreaLinkSchema.safeParse({
    departamentoId: formData.get('departamentoId'),
    areaId: formData.get('areaId'),
    slug: formData.get('slug'),
    conversaId:
      rawConversa === null || rawConversa === '' || rawConversa === '__none__'
        ? null
        : rawConversa,
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirArea(parsed.data.departamentoId)
    const area = await assertAreaNoDepartamento(
      tenant.id,
      parsed.data.departamentoId,
      parsed.data.areaId,
    )

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

      const [deptoDono, areaDona, sedeDona]: [
        { id: string } | null,
        { id: string } | null,
        { id: string } | null,
      ] = await Promise.all([
        db.departamento.findFirst({
          where: { canalConversaId: canal.id },
          select: { id: true },
        }),
        db.departamentoArea.findFirst({
          where: { canalConversaId: canal.id },
          select: { id: true },
        }),
        db.sede.findFirst({
          where: { canalConversaId: canal.id },
          select: { id: true },
        }),
      ])

      const erro = validarVinculoCanalArea({
        conversaId: canal.id,
        areaId: area.id,
        usadoPorDepartamentoId: deptoDono?.id ?? null,
        usadoPorAreaId: areaDona?.id ?? null,
        usadoPorSedeId: sedeDona?.id ?? null,
      })
      if (erro) return { error: erro }
    }

    await db.departamentoArea.update({
      where: { id: area.id },
      data: { canalConversaId: parsed.data.conversaId },
    })

    if (parsed.data.conversaId) {
      await syncMembrosCanalArea(db, area.id)
    }

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'AREA_CANAL_VINCULADO',
        entidade: 'DepartamentoArea',
        entidadeId: area.id,
        detalhes: {
          area: area.nome,
          conversaId: parsed.data.conversaId,
        },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível vincular o canal' }
  }
}
