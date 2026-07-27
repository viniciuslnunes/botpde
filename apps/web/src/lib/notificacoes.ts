import { db } from '@torcida/db'
import type { Notificacao, TipoNotificacao } from '@torcida/db'
import {
  calculateEffectivePermissions,
  formatNomeTorcida,
  hasPermission,
  PERMISSIONS,
  permissionsOfRole,
} from '@torcida/types'
import { cache } from 'react'
import { superAdminEmails } from '@/lib/env'
import { emitNotificacaoPing } from './notificacoes-bus'
import { agregarBadgesPorMenu } from '@/lib/notificacoes-menu-badges'

export type CriarNotificacaoInput = {
  userId: string
  tenantId: string
  tipo: TipoNotificacao
  titulo: string
  corpo?: string
  link?: string
  /** Quem gerou a notificação (comentou, seguiu, reagiu…) — para avatar na UI. */
  atorId?: string
}

/**
 * Cria uma notificação persistente (sino do portal/admin).
 * Preferir `notificarSafe` / helpers em lote nas Server Actions.
 */
export async function criarNotificacao(input: CriarNotificacaoInput): Promise<Notificacao> {
  const created: Notificacao = await db.notificacao.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo,
      link: input.link,
      atorId: input.atorId,
    },
  })
  emitNotificacaoPing(created.tenantId, created.userId)
  return created
}

export async function criarNotificacoesEmLote(inputs: CriarNotificacaoInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  const result = await db.notificacao.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      tenantId: input.tenantId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo ?? null,
      link: input.link ?? null,
      atorId: input.atorId ?? null,
    })),
  })
  for (const input of inputs) {
    emitNotificacaoPing(input.tenantId, input.userId)
  }
  return result.count
}

type RolePermShape = {
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
  departamento: { permissions: string[]; permissionsGestor: string[] } | null
}

type DeptoPermShape = { permissions: string[]; permissionsGestor: string[] }

type TenantRbacSnapshot = {
  rolesByUser: Map<string, RolePermShape[]>
  overridesByUser: Map<string, { permission: string; granted: boolean }[]>
  deptosByUser: Map<string, Array<{ departamentoId: string; departamento: DeptoPermShape }>>
  gestaoByUser: Map<string, Array<{ departamentoId: string; departamento: DeptoPermShape }>>
}

/** Carrega roles, overrides e departamentos do tenant uma única vez. */
async function carregarSnapshotRbacTenant(tenantId: string): Promise<TenantRbacSnapshot> {
  const [userRoles, overrides, userDepartamentos, gestaoDepartamentos]: [
    Array<{ userId: string; role: RolePermShape }>,
    Array<{ userId: string; permission: string; granted: boolean }>,
    Array<{ userId: string; departamentoId: string; departamento: DeptoPermShape }>,
    Array<{ userId: string; departamentoId: string; departamento: DeptoPermShape }>,
  ] = await Promise.all([
    db.userRole.findMany({
      where: { tenantId },
      select: {
        userId: true,
        role: {
          select: {
            permissions: true,
            permissionsExtras: true,
            departamentoId: true,
            papelNoDepartamento: true,
            departamento: { select: { permissions: true, permissionsGestor: true } },
          },
        },
      },
    }),
    db.userPermission.findMany({
      where: { tenantId },
      select: { userId: true, permission: true, granted: true },
    }),
    db.userDepartamento.findMany({
      where: { tenantId },
      select: {
        userId: true,
        departamentoId: true,
        departamento: { select: { permissions: true, permissionsGestor: true } },
      },
    }),
    db.departamentoGestor.findMany({
      where: { departamento: { tenantId } },
      select: {
        userId: true,
        departamentoId: true,
        departamento: { select: { permissions: true, permissionsGestor: true } },
      },
    }),
  ])

  const rolesByUser = new Map<string, RolePermShape[]>()
  for (const ur of userRoles) {
    const prev = rolesByUser.get(ur.userId) ?? []
    prev.push(ur.role)
    rolesByUser.set(ur.userId, prev)
  }

  const overridesByUser = new Map<string, { permission: string; granted: boolean }[]>()
  for (const o of overrides) {
    const prev = overridesByUser.get(o.userId) ?? []
    prev.push({ permission: o.permission, granted: o.granted })
    overridesByUser.set(o.userId, prev)
  }

  const deptosByUser = new Map<string, Array<{ departamentoId: string; departamento: DeptoPermShape }>>()
  for (const ud of userDepartamentos) {
    const prev = deptosByUser.get(ud.userId) ?? []
    prev.push(ud)
    deptosByUser.set(ud.userId, prev)
  }

  const gestaoByUser = new Map<string, Array<{ departamentoId: string; departamento: DeptoPermShape }>>()
  for (const g of gestaoDepartamentos) {
    const prev = gestaoByUser.get(g.userId) ?? []
    prev.push(g)
    gestaoByUser.set(g.userId, prev)
  }

  return { rolesByUser, overridesByUser, deptosByUser, gestaoByUser }
}

function calcularPermissoesEfetivasDoSnapshot(
  snapshot: TenantRbacSnapshot,
  userId: string,
): string[] {
  const base = new Set<string>()
  const coveredDeptoIds = new Set<string>()

  for (const role of snapshot.rolesByUser.get(userId) ?? []) {
    for (const p of permissionsOfRole(role, role.departamento)) base.add(p)
    if (role.departamentoId) coveredDeptoIds.add(role.departamentoId)
  }

  const uds = snapshot.deptosByUser.get(userId) ?? []
  const gestoes = snapshot.gestaoByUser.get(userId) ?? []
  const gestorIds = new Set(gestoes.map((g) => g.departamentoId))

  for (const ud of uds) {
    if (coveredDeptoIds.has(ud.departamentoId)) continue
    for (const p of ud.departamento.permissions) base.add(p)
    if (gestorIds.has(ud.departamentoId)) {
      for (const p of ud.departamento.permissionsGestor) base.add(p)
    }
  }
  for (const g of gestoes) {
    if (coveredDeptoIds.has(g.departamentoId)) continue
    if (uds.some((ud) => ud.departamentoId === g.departamentoId)) continue
    for (const p of g.departamento.permissions) base.add(p)
    for (const p of g.departamento.permissionsGestor) base.add(p)
  }

  return calculateEffectivePermissions(
    Array.from(base),
    snapshot.overridesByUser.get(userId) ?? [],
  )
}

function filtrarUserIdsPorPermissoes(
  snapshot: TenantRbacSnapshot,
  permissions: string[],
): string[] {
  const userIds = new Set<string>([
    ...snapshot.rolesByUser.keys(),
    ...snapshot.overridesByUser.keys(),
    ...snapshot.deptosByUser.keys(),
    ...snapshot.gestaoByUser.keys(),
  ])

  const matched: string[] = []
  for (const userId of userIds) {
    const effective = calcularPermissoesEfetivasDoSnapshot(snapshot, userId)
    if (permissions.some((p) => hasPermission(effective, p))) matched.push(userId)
  }
  return matched
}

/**
 * UserIds com qualquer uma das permissões efetivas no tenant (OR).
 * Uma única carga do snapshot RBAC — preferir a múltiplas chamadas isoladas.
 */
export async function listarUserIdsComQualquerPermissao(
  tenantId: string,
  permissions: string[],
): Promise<string[]> {
  if (permissions.length === 0) return []
  const snapshot = await carregarSnapshotRbacTenant(tenantId)
  return filtrarUserIdsPorPermissoes(snapshot, permissions)
}

/**
 * UserIds com a permissão efetiva no tenant (roles + deptos + overrides).
 * Espelha a lógica de `fetchUserPermissionsImpl` em lote.
 */
export async function listarUserIdsComPermissao(
  tenantId: string,
  permission: string,
): Promise<string[]> {
  return listarUserIdsComQualquerPermissao(tenantId, [permission])
}

/**
 * UserIds dos super-admins configurados em SUPER_ADMIN_EMAILS.
 * Operadores entram no admin sem UserRole no tenant — precisam receber
 * alertas operacionais (alianças, denúncias…) no sino da torcida gerida.
 */
export async function listarUserIdsSuperAdmin(): Promise<string[]> {
  if (superAdminEmails.length === 0) return []
  const users: Array<{ id: string }> = await db.user.findMany({
    where: { email: { in: superAdminEmails } },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

/**
 * Destinatários admin com qualquer permissão da lista (OR) + super-admins.
 */
export async function listarDestinatariosAdminPorPermissoes(
  tenantId: string,
  permissions: string[],
  excetoUserId?: string,
): Promise<string[]> {
  const [comPermissao, superAdmins] = await Promise.all([
    listarUserIdsComQualquerPermissao(tenantId, permissions),
    listarUserIdsSuperAdmin(),
  ])
  const merged = new Set<string>([...comPermissao, ...superAdmins])
  if (excetoUserId) merged.delete(excetoUserId)
  return Array.from(merged)
}

/**
 * Destinatários de alerta administrativo: quem tem a permissão no tenant
 * + super-admins (modo operador), menos `excetoUserId` se informado.
 */
export async function listarDestinatariosAdmin(
  tenantId: string,
  permission: string,
  excetoUserId?: string,
): Promise<string[]> {
  return listarDestinatariosAdminPorPermissoes(tenantId, [permission], excetoUserId)
}

export async function listarUserIdsMembrosAprovados(tenantId: string): Promise<string[]> {
  const membros: Array<{ userId: string }> = await db.saasMembro.findMany({
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
  })
  return membros.map((m) => m.userId)
}

type DestinoNotificacao = {
  tenantId: string
  tipo: TipoNotificacao
  titulo: string
  corpo?: string
  link?: string
  /** Quem gerou a notificação (para avatar na UI). */
  atorId?: string
  /** Quem iniciou a ação — não recebe a própria notificação (mesmo tenant). */
  excetoUserId?: string
}

/** Notifica usuários com permissão no tenant + super-admins (best-effort). */
export async function notificarUsuariosComPermissao(
  permission: string,
  destino: DestinoNotificacao,
): Promise<number> {
  try {
    const targets = await listarDestinatariosAdmin(
      destino.tenantId,
      permission,
      destino.excetoUserId,
    )
    return criarNotificacoesEmLote(
      targets.map((userId) => ({
        userId,
        tenantId: destino.tenantId,
        tipo: destino.tipo,
        titulo: destino.titulo,
        corpo: destino.corpo,
        link: destino.link,
        atorId: destino.atorId,
      })),
    )
  } catch {
    return 0
  }
}

/** Notifica membros APROVADOS do tenant (ex.: comunicado urgente). Best-effort. */
export async function notificarMembrosAprovados(destino: DestinoNotificacao): Promise<number> {
  try {
    const userIds = await listarUserIdsMembrosAprovados(destino.tenantId)
    const targets = userIds.filter((id) => id !== destino.excetoUserId)
    return criarNotificacoesEmLote(
      targets.map((userId) => ({
        userId,
        tenantId: destino.tenantId,
        tipo: destino.tipo,
        titulo: destino.titulo,
        corpo: destino.corpo,
        link: destino.link,
        atorId: destino.atorId,
      })),
    )
  } catch {
    return 0
  }
}

/** Wrapper que engole erros — use ao final de Server Actions. */
export async function notificarSafe(input: CriarNotificacaoInput): Promise<void> {
  try {
    await criarNotificacao(input)
  } catch {
    // best-effort
  }
}

export type NotificacaoInboxItem = {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string | null
  link: string | null
  lida: boolean
  criadoEm: Date
  ator: { id: string; nome: string | null; avatarUrl: string | null } | null
}

const NOTIFICACAO_INBOX_SELECT = {
  id: true,
  tipo: true,
  titulo: true,
  corpo: true,
  link: true,
  lida: true,
  criadoEm: true,
  ator: { select: { id: true, nome: true, avatarUrl: true } },
} as const

/**
 * Decisões de admissão gravadas no tenant da torcida — o solicitante ainda
 * está na Comunidade Nacional (tenant sintético) e precisa vê-las no sino.
 */
export const TIPOS_DECISAO_ADMISSAO: readonly TipoNotificacao[] = [
  'MEMBRO_APROVADO',
  'MEMBRO_REPROVADO',
]

type NotificacaoWhere = {
  userId: string
  tipo: { in: TipoNotificacao[] }
  tenantId?: string
  OR?: Array<
    | { tenantId: string }
    | {
        tipo: { in: TipoNotificacao[] }
        tenant: { afiliacaoId: string; sintetico: false; ativo: true }
      }
  >
}

/**
 * Where do sino do portal. Na CN (tenant sintético), inclui MEMBRO_APROVADO /
 * MEMBRO_REPROVADO do clube — a notificação canônica vive no tenant da torcida,
 * mas o solicitante assina SSE/inbox da CN até o redirect pós-aprovação.
 */
export async function whereInboxPortal(
  tenantId: string,
  userId: string,
  tipos: TipoNotificacao[],
): Promise<NotificacaoWhere> {
  const base: NotificacaoWhere = { userId, tipo: { in: tipos } }
  const tenant: { sintetico: boolean; afiliacaoId: string | null } | null =
    await db.tenant.findUnique({
      where: { id: tenantId },
      select: { sintetico: true, afiliacaoId: true },
    })
  if (!tenant?.sintetico || !tenant.afiliacaoId) {
    return { ...base, tenantId }
  }
  const tiposAdmissao = tipos.filter((t): t is TipoNotificacao =>
    (TIPOS_DECISAO_ADMISSAO as readonly string[]).includes(t),
  )
  if (tiposAdmissao.length === 0) {
    return { ...base, tenantId }
  }
  return {
    ...base,
    OR: [
      { tenantId },
      {
        tipo: { in: tiposAdmissao },
        tenant: {
          afiliacaoId: tenant.afiliacaoId,
          sintetico: false,
          ativo: true,
        },
      },
    ],
  }
}

/**
 * Ping extra na CN após criar MEMBRO_APROVADO/REPROVADO no tenant da torcida.
 * `criarNotificacao` já pinga a torcida; o solicitante PENDENTE assina SSE da CN
 * (`resolveTenantIdPortalComunidade`), então precisa deste canal também.
 */
export async function emitNotificacaoPingCnDoSolicitante(
  tenantTorcidaId: string,
  userId: string,
): Promise<void> {
  const tenant: { afiliacaoId: string | null; sintetico: boolean } | null =
    await db.tenant.findUnique({
      where: { id: tenantTorcidaId },
      select: { afiliacaoId: true, sintetico: true },
    })
  if (!tenant?.afiliacaoId || tenant.sintetico) return
  const { getOrCreateComunidadeNacionalTenant } = await import('@/lib/comunidade-contexto')
  const sintetico = await getOrCreateComunidadeNacionalTenant(tenant.afiliacaoId)
  if (sintetico.id !== tenantTorcidaId) {
    emitNotificacaoPing(sintetico.id, userId)
  }
}

/**
 * Lista recentes + contagem de não lidas (+ badges por menu, quando solicitado)
 * num único round-trip ao banco. Usado pelas APIs de navbar (portal e admin).
 */
export async function getInboxNavbar(
  tenantId: string,
  userId: string,
  tipos: TipoNotificacao[],
  limite = 8,
  opts?: { withMenuBadges?: boolean; portalComCn?: boolean },
): Promise<{
  notifications: NotificacaoInboxItem[]
  unreadCount: number
  menuBadges: Record<string, number>
}> {
  if (tipos.length === 0) {
    return { notifications: [], unreadCount: 0, menuBadges: {} }
  }

  const baseWhere = opts?.portalComCn
    ? await whereInboxPortal(tenantId, userId, tipos)
    : { tenantId, userId, tipo: { in: tipos } }
  const withMenuBadges = opts?.withMenuBadges === true

  if (!withMenuBadges) {
    const [notifications, unreadCount]: [NotificacaoInboxItem[], number] = await db.$transaction([
      db.notificacao.findMany({
        where: baseWhere,
        orderBy: { criadoEm: 'desc' },
        take: limite,
        select: NOTIFICACAO_INBOX_SELECT,
      }),
      db.notificacao.count({
        where: { ...baseWhere, lida: false },
      }),
    ])
    return { notifications, unreadCount, menuBadges: {} }
  }

  const [notifications, unreadCount, grouped]: [
    NotificacaoInboxItem[],
    number,
    Array<{ tipo: TipoNotificacao; _count: { tipo: number } }>,
  ] = await db.$transaction([
    db.notificacao.findMany({
      where: baseWhere,
      orderBy: { criadoEm: 'desc' },
      take: limite,
      select: NOTIFICACAO_INBOX_SELECT,
    }),
    db.notificacao.count({
      where: { ...baseWhere, lida: false },
    }),
    db.notificacao.groupBy({
      by: ['tipo'],
      where: { ...baseWhere, lida: false },
      _count: { tipo: true },
    }),
  ])

  return {
    notifications,
    unreadCount,
    menuBadges: agregarBadgesPorMenu(grouped),
  }
}

export async function contarNotificacoesNaoLidas(
  tenantId: string,
  userId: string,
  tipos: TipoNotificacao[],
): Promise<number> {
  if (tipos.length === 0) return 0
  return db.notificacao.count({
    where: { tenantId, userId, lida: false, tipo: { in: tipos } },
  })
}

export async function listarNotificacoesRecentes(
  tenantId: string,
  userId: string,
  limite = 8,
  tipos?: TipoNotificacao[],
): Promise<NotificacaoInboxItem[]> {
  return db.notificacao.findMany({
    where: {
      tenantId,
      userId,
      ...(tipos && tipos.length > 0 ? { tipo: { in: tipos } } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    take: limite,
    select: NOTIFICACAO_INBOX_SELECT,
  })
}

/**
 * Garante ALIANCA_PROPOSTA para destinatários do tenant quando há propostas
 * PENDENTE sem notificação (ex.: propostas criadas antes do fan-out incluir
 * super-admins, ou tenants sem UserRole).
 * Uma vez por request via React.cache.
 */
export const reconciliarPropostasAliancaPendentes = cache(async function reconciliarPropostasAliancaPendentes(
  tenantId: string,
): Promise<number> {
  try {
    const pendentes: Array<{
      tenantOrigem: { nome: string }
      tenantAliado: { nome: string }
    }> = await db.alianca.findMany({
      where: { tenantAliadoId: tenantId, status: 'PENDENTE' },
      select: {
        tenantOrigem: { select: { nome: true } },
        tenantAliado: { select: { nome: true } },
      },
    })
    if (pendentes.length === 0) return 0

    const targets = await listarDestinatariosAdmin(tenantId, PERMISSIONS.ALLIANCES_MANAGE)
    if (targets.length === 0) return 0

    // Uma única query para todas as propostas pendentes (evita N+1 no loop).
    const titulos = pendentes.map(
      (al) => `Proposta de aliança de ${formatNomeTorcida(al.tenantOrigem.nome)}`,
    )
    const existentes: Array<{ userId: string; titulo: string }> = await db.notificacao.findMany({
      where: {
        tenantId,
        tipo: 'ALIANCA_PROPOSTA',
        titulo: { in: titulos },
        userId: { in: targets },
      },
      select: { userId: true, titulo: true },
    })
    const jaTemPorTitulo = new Map<string, Set<string>>()
    for (const e of existentes) {
      const set = jaTemPorTitulo.get(e.titulo) ?? new Set<string>()
      set.add(e.userId)
      jaTemPorTitulo.set(e.titulo, set)
    }

    let criadas = 0
    for (const al of pendentes) {
      const origemNome = formatNomeTorcida(al.tenantOrigem.nome)
      const aliadoNome = formatNomeTorcida(al.tenantAliado.nome)
      const titulo = `Proposta de aliança de ${origemNome}`
      const jaTem = jaTemPorTitulo.get(titulo) ?? new Set<string>()
      const faltando = targets.filter((id) => !jaTem.has(id))
      if (faltando.length === 0) continue

      criadas += await criarNotificacoesEmLote(
        faltando.map((userId) => ({
          userId,
          tenantId,
          tipo: 'ALIANCA_PROPOSTA' as const,
          titulo,
          corpo: `${origemNome} propôs aliança com ${aliadoNome}.`,
          link: '/admin/aliancas',
        })),
      )
    }
    return criadas
  } catch {
    return 0
  }
})
