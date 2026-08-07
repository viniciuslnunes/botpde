import { cache } from 'react'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  calculateEffectivePermissions,
  canManageDepartamento,
  capabilityPorSlug,
  hasPermission,
  isDepartamentoLegado,
  PERMISSIONS,
  resolverEscopoPatrimonio,
} from '@torcida/types'
import {
  podeAbrirDepartamentoPortal,
  resolverAreasDepartamento,
  type AreaAcesso,
  type AreaBase,
} from '@/lib/departamentos-portal-access'

export type DeptoRow = {
  id: string
  nome: string
  slug: string
  cor: string
  moduloPortal: string | null
  permissions: string[]
  permissionsGestor: string[]
  meta: unknown
  canalConversaId: string | null
  canalConversa: { id: string; nome: string | null; avatarUrl: string | null } | null
}

export interface DepartamentoContexto {
  userId: string
  tenant: NonNullable<Awaited<ReturnType<typeof getTenantFromHost>>>
  departamento: DeptoRow
  capability: ReturnType<typeof capabilityPorSlug>
  isSuperAdmin: boolean
  /**
   * Row em `DepartamentoGestor` desta área (delegação pontual).
   * Preferir `podeGerirEquipe` para UI/autorização de gestão.
   */
  isGestor: boolean
  /** Tem `UserDepartamento` nesta área (equipe canônica). */
  isAtuacao: boolean
  /** Enxerga por ser Diretoria (ou SA operador), sem atuação própria na área. */
  visaoDiretoria: boolean
  permissoesEfetivas: string[]
  /**
   * Autorização real de gestão (`canManageDepartamento`: `roles:manage` OU
   * row de gestor). Use isto para visão de administrador no cockpit.
   */
  podeGerirEquipe: boolean
  /** Aprovar filas desta área — RBAC real; SA só se tiver o cargo no tenant. */
  podeAprovarArea: boolean
  /** Oversight: SA vê blocos mesmo sem a permissão no tenant. */
  podeVerFinanceiro: boolean
  podeVerPatrimonio: boolean
  /** Acervo de bandeiras: `patrimony:view` (tudo) OU `flags:view` (só bandeira). */
  podeVerAcervoBandeiras: boolean
  podeModerar: boolean
  areas: AreaAcesso[]
  minhasAreas: AreaAcesso[]
}

/**
 * Loader único do cockpit de um departamento: gate de acesso + flags de RBAC
 * + áreas resolvidas. Espelha `configuracoes/_lib/contexto.ts` — a page e os
 * blocos consomem flags, nunca refazem RBAC.
 */
export const getDepartamentoContexto = cache(async function getDepartamentoContexto(
  slug: string,
): Promise<DepartamentoContexto | null> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/')

  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  // Torcedor/Sócio são TipoMembro — nunca home de departamento.
  if (isDepartamentoLegado(slug)) notFound()

  const [depto, memberships, diretoriaRow]: [
    DeptoRow | null,
    Array<{ departamentoId: string }>,
    { id: string } | null,
  ] = await Promise.all([
    db.departamento.findFirst({
      where: { tenantId: tenant.id, slug },
      select: {
        id: true,
        nome: true,
        slug: true,
        cor: true,
        moduloPortal: true,
        permissions: true,
        permissionsGestor: true,
        meta: true,
        canalConversaId: true,
        canalConversa: { select: { id: true, nome: true, avatarUrl: true } },
      },
    }),
    db.userDepartamento.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { departamentoId: true },
    }),
    db.departamento.findFirst({
      where: { tenantId: tenant.id, slug: 'diretoria' },
      select: { id: true },
    }),
  ])
  if (!depto || isDepartamentoLegado(depto)) notFound()

  const membershipIds = memberships.map((m) => m.departamentoId)
  const podeAbrir = podeAbrirDepartamentoPortal({
    departamentoId: depto.id,
    membershipIds,
    diretoriaId: diretoriaRow?.id ?? null,
    isSuperAdmin,
  })
  if (!podeAbrir) redirect('/portal/departamentos')

  const isAtuacao = membershipIds.includes(depto.id)
  const isDiretoria =
    isSuperAdmin || (diretoriaRow != null && membershipIds.includes(diretoriaRow.id))
  const visaoDiretoria = isDiretoria && !isAtuacao

  const [gestao, { rolePermissions, overrides }]: [
    { id: string } | null,
    Awaited<ReturnType<typeof getUserPermissionsInTenant>>,
  ] = await Promise.all([
    db.departamentoGestor.findFirst({
      where: { userId: session.user.id, departamentoId: depto.id },
      select: { id: true },
    }),
    getUserPermissionsInTenant(session.user.id, tenant.id),
  ])
  const isGestor = Boolean(gestao)
  const permissoesEfetivas = calculateEffectivePermissions(rolePermissions, overrides)
  // Gestão nunca vem do bypass de plataforma — só RBAC/gestor reais (dual-hat ok).
  const podeGerirEquipe = canManageDepartamento(
    permissoesEfetivas,
    gestao ? [depto.id] : [],
    depto.id,
  )

  const podeAprovarArea = hasPermission(permissoesEfetivas, PERMISSIONS.MEMBERS_APPROVE)
  // Leitura: SA operador enxerga os painéis da área (oversight); escrita fica
  // atrás de isGestor/podeGerirEquipe.
  const podeVerFinanceiro =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.FINANCE_VIEW)
  const podeVerPatrimonio =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.PATRIMONY_VIEW)
  const podeVerAcervoBandeiras = resolverEscopoPatrimonio(permissoesEfetivas, {
    isSuperAdmin,
  }).podeVer
  const podeModerar =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.COMMUNITY_MODERATE)

  type AreaRow = {
    id: string
    nome: string
    slug: string
    descricao: string | null
    icone: string | null
    ordem: number
    ativa: boolean
    sazonal: boolean
    meta: unknown
    canalConversaId: string | null
    canalConversa: { id: string; nome: string | null; avatarUrl: string | null } | null
  }
  const areasDb: AreaRow[] = await db.departamentoArea.findMany({
    where: { departamentoId: depto.id, tenantId: tenant.id },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      slug: true,
      descricao: true,
      icone: true,
      ordem: true,
      ativa: true,
      sazonal: true,
      meta: true,
      canalConversaId: true,
      canalConversa: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })
  const areasRaw: AreaBase[] = areasDb.map((r) => ({
    id: r.id,
    nome: r.nome,
    slug: r.slug,
    descricao: r.descricao,
    icone: r.icone,
    ordem: r.ordem,
    ativa: r.ativa,
    sazonal: r.sazonal,
    meta: r.meta,
    canalConversaId: r.canalConversaId,
    canalNome: r.canalConversa?.nome ?? null,
    canalAvatarUrl: r.canalConversa?.avatarUrl ?? null,
  }))

  const meusVinculos: Array<{ areaId: string; papel: string }> =
    areasRaw.length > 0
      ? await db.departamentoAreaMembro.findMany({
          where: { userId: session.user.id, areaId: { in: areasRaw.map((a) => a.id) } },
          select: { areaId: true, papel: true },
        })
      : []
  const membroAreaIds = new Set(meusVinculos.map((v) => v.areaId))
  const responsavelAreaIds = new Set(
    meusVinculos.filter((v) => v.papel === 'RESPONSAVEL').map((v) => v.areaId),
  )

  const areas = resolverAreasDepartamento({
    areas: areasRaw,
    membroAreaIds,
    responsavelAreaIds,
    isGestorDepartamento: podeGerirEquipe,
  })
  const minhasAreas = areas.filter((a) => a.isMembro)

  return {
    userId: session.user.id,
    tenant,
    departamento: depto,
    capability: capabilityPorSlug(depto.slug),
    isSuperAdmin,
    isGestor,
    isAtuacao,
    visaoDiretoria,
    permissoesEfetivas,
    podeGerirEquipe,
    podeAprovarArea,
    podeVerFinanceiro,
    podeVerPatrimonio,
    podeVerAcervoBandeiras,
    podeModerar,
    areas,
    minhasAreas,
  }
})
