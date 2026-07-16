import { db } from '@torcida/db'
import type { Notificacao, TipoNotificacao } from '@torcida/db'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  permissionsOfRole,
} from '@torcida/types'
import { cache } from 'react'
import { superAdminEmails } from '@/lib/env'
import { emitNotificacaoPing } from './notificacoes-bus'

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
 * Destinatários de alerta administrativo: quem tem a permissão no tenant
 * + super-admins (modo operador), menos `excetoUserId` se informado.
 */
export async function listarDestinatariosAdmin(
  tenantId: string,
  permission: string,
  excetoUserId?: string,
): Promise<string[]> {
  const [comPermissao, superAdmins] = await Promise.all([
    listarUserIdsComPermissao(tenantId, permission),
    listarUserIdsSuperAdmin(),
  ])
  const merged = new Set<string>([...comPermissao, ...superAdmins])
  if (excetoUserId) merged.delete(excetoUserId)
  return Array.from(merged)
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
): Promise<
  Array<{
    id: string
    tipo: TipoNotificacao
    titulo: string
    corpo: string | null
    link: string | null
    lida: boolean
    criadoEm: Date
    ator: { id: string; nome: string | null; avatarUrl: string | null } | null
  }>
> {
  return db.notificacao.findMany({
    where: {
      tenantId,
      userId,
      ...(tipos && tipos.length > 0 ? { tipo: { in: tipos } } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    take: limite,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      corpo: true,
      link: true,
      lida: true,
      criadoEm: true,
      ator: { select: { id: true, nome: true, avatarUrl: true } },
    },
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
    const titulos = pendentes.map((al) => `Proposta de aliança de ${al.tenantOrigem.nome}`)
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
      const titulo = `Proposta de aliança de ${al.tenantOrigem.nome}`
      const jaTem = jaTemPorTitulo.get(titulo) ?? new Set<string>()
      const faltando = targets.filter((id) => !jaTem.has(id))
      if (faltando.length === 0) continue

      criadas += await criarNotificacoesEmLote(
        faltando.map((userId) => ({
          userId,
          tenantId,
          tipo: 'ALIANCA_PROPOSTA' as const,
          titulo,
          corpo: `${al.tenantOrigem.nome} propôs aliança com ${al.tenantAliado.nome}.`,
          link: '/admin/aliancas',
        })),
      )
    }
    return criadas
  } catch {
    return 0
  }
})
