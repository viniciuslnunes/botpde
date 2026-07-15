import { db } from '@torcida/db'
import type { Notificacao, TipoNotificacao } from '@torcida/db'
import {
  calculateEffectivePermissions,
  hasPermission,
  permissionsOfRole,
} from '@torcida/types'

export type CriarNotificacaoInput = {
  userId: string
  tenantId: string
  tipo: TipoNotificacao
  titulo: string
  corpo?: string
  link?: string
}

/**
 * Cria uma notificação persistente (sino do portal/admin).
 * Preferir `notificarSafe` / helpers em lote nas Server Actions.
 */
export async function criarNotificacao(input: CriarNotificacaoInput): Promise<Notificacao> {
  return db.notificacao.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo,
      link: input.link,
    },
  })
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
    })),
  })
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

/**
 * UserIds com a permissão efetiva no tenant (roles + deptos + overrides).
 * Espelha a lógica de `fetchUserPermissionsImpl` em lote.
 */
export async function listarUserIdsComPermissao(
  tenantId: string,
  permission: string,
): Promise<string[]> {
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

  const userIds = new Set<string>([
    ...rolesByUser.keys(),
    ...overridesByUser.keys(),
    ...deptosByUser.keys(),
    ...gestaoByUser.keys(),
  ])

  const matched: string[] = []
  for (const userId of userIds) {
    const base = new Set<string>()
    const coveredDeptoIds = new Set<string>()

    for (const role of rolesByUser.get(userId) ?? []) {
      for (const p of permissionsOfRole(role, role.departamento)) base.add(p)
      if (role.departamentoId) coveredDeptoIds.add(role.departamentoId)
    }

    const uds = deptosByUser.get(userId) ?? []
    const gestoes = gestaoByUser.get(userId) ?? []
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

    const effective = calculateEffectivePermissions(
      Array.from(base),
      overridesByUser.get(userId) ?? [],
    )
    if (hasPermission(effective, permission)) matched.push(userId)
  }

  return matched
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
  /** Quem iniciou a ação — não recebe a própria notificação. */
  excetoUserId?: string
}

/** Notifica usuários com permissão no tenant (best-effort). */
export async function notificarUsuariosComPermissao(
  permission: string,
  destino: DestinoNotificacao,
): Promise<number> {
  try {
    const userIds = await listarUserIdsComPermissao(destino.tenantId, permission)
    const targets = userIds.filter((id) => id !== destino.excetoUserId)
    return criarNotificacoesEmLote(
      targets.map((userId) => ({
        userId,
        tenantId: destino.tenantId,
        tipo: destino.tipo,
        titulo: destino.titulo,
        corpo: destino.corpo,
        link: destino.link,
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

export async function listarNotificacoesRecentes(
  tenantId: string,
  userId: string,
  limite = 8,
): Promise<
  Array<{
    id: string
    titulo: string
    corpo: string | null
    link: string | null
    lida: boolean
    criadoEm: Date
  }>
> {
  return db.notificacao.findMany({
    where: { tenantId, userId },
    orderBy: { criadoEm: 'desc' },
    take: limite,
    select: {
      id: true,
      titulo: true,
      corpo: true,
      link: true,
      lida: true,
      criadoEm: true,
    },
  })
}
