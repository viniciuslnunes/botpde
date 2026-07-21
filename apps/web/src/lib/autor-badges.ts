import { db } from '@torcida/db'
import { SYSTEM_ROLES, rotuloCargoSistema } from '@torcida/types'
import type { PostSocialItem } from './feed'

export { formatAutorCargoBadge } from './autor-badges-format'

export interface AutorBadge {
  sedeNome: string | null
  cargoNome: string | null
  departamentoNome: string | null
}

type TipoSede = 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'

type RoleBadgeLite = {
  nome: string
  isSystem: boolean
  ordem: number
  departamentoNome: string | null
}

export function chave(autorId: string, tenantId: string): string {
  return `${autorId}:${tenantId}`
}

/** Prioridade de cargo de sistema no badge do feed (menor = mais alto). */
function prioridadeSistema(nome: string): number {
  switch (nome) {
    case SYSTEM_ROLES.OWNER:
      return 0
    case SYSTEM_ROLES.VICE:
      return 1
    case SYSTEM_ROLES.ADMIN:
      return 2
    case SYSTEM_ROLES.MEMBER:
      return 9
    default:
      return 5
  }
}

export function escolherCargoPrincipal(roles: RoleBadgeLite[]): RoleBadgeLite | null {
  if (roles.length === 0) return null
  return [...roles].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    if (a.isSystem && b.isSystem) {
      return prioridadeSistema(a.nome) - prioridadeSistema(b.nome)
    }
    return a.ordem - b.ordem || a.nome.localeCompare(b.nome)
  })[0]!
}

export function rotuloCargoBadge(role: RoleBadgeLite, tipoSede: TipoSede): string {
  return role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
}

/**
 * Departamento/área de atuação: membership real (UserDepartamento), depois
 * departamento do perfil principal, depois preferência do cadastro.
 */
export function resolverDepartamentoBadge(args: {
  memberships: string[]
  roleDepartamento: string | null
  preferencia: string | null
}): string | null {
  if (args.memberships.length > 0) return args.memberships.join(' · ')
  return args.roleDepartamento ?? args.preferencia
}

export async function getBadgesPorAutorTenant(
  pares: Array<{ autorId: string; tenantId: string }>,
): Promise<Map<string, AutorBadge>> {
  const vistos = new Set<string>()
  const unicos = pares.filter((p) => {
    const k = chave(p.autorId, p.tenantId)
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  if (unicos.length === 0) return new Map()

  const autorIds = [...new Set(unicos.map((p) => p.autorId))]
  const tenantIds = [...new Set(unicos.map((p) => p.tenantId))]

  // Fallback de `tipoSede` quando o membro não tem `sedeId` (ex.: torcida com
  // Sede única, sem seleção no cadastro): usa o tipo da Sede raiz do próprio
  // tenant, em vez de assumir 'SEDE' — senão uma subsede/PDE promovida a
  // tenant próprio (Caso B) exibe "Presidente" em vez de "Liderança". Uma
  // unidade promovida mantém Sede.sedeId apontando pra Sede-mãe (outro
  // tenant), então a raiz não é identificável por `sedeId: null` — e se ela
  // tiver filhos territoriais movidos junto (mesmo tenantId), a raiz é a
  // única cujo `sedeId` não aponta pra outra Sede do mesmo tenant.
  const sedesDoTenant: Array<{ id: string; tenantId: string | null; sedeId: string | null; tipo: TipoSede }> =
    await db.sede.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true, tenantId: true, sedeId: true, tipo: true },
    })
  const sedesPorTenant = new Map<string, typeof sedesDoTenant>()
  for (const s of sedesDoTenant) {
    if (!s.tenantId) continue
    const arr = sedesPorTenant.get(s.tenantId) ?? []
    arr.push(s)
    sedesPorTenant.set(s.tenantId, arr)
  }
  const tipoSedeRaizMap = new Map<string, TipoSede>()
  for (const [tenantId, sedes] of sedesPorTenant) {
    const idsDoTenant = new Set(sedes.map((s) => s.id))
    const raiz = sedes.find((s) => !s.sedeId || !idsDoTenant.has(s.sedeId))
    if (raiz) tipoSedeRaizMap.set(tenantId, raiz.tipo)
  }

  const [membros, roles, memberships]: [
    Array<{
      userId: string
      tenantId: string
      sede: { nome: string; tipo: TipoSede } | null
      departamento: { nome: string } | null
    }>,
    Array<{
      userId: string
      tenantId: string
      role: {
        nome: string
        isSystem: boolean
        ordem: number
        departamento: { nome: string } | null
      }
    }>,
    Array<{
      userId: string
      tenantId: string
      departamento: { nome: string }
    }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds }, status: 'APROVADO' },
      select: {
        userId: true,
        tenantId: true,
        sede: { select: { nome: true, tipo: true } },
        departamento: { select: { nome: true } },
      },
    }),
    db.userRole.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds } },
      select: {
        userId: true,
        tenantId: true,
        role: {
          select: {
            nome: true,
            isSystem: true,
            ordem: true,
            departamento: { select: { nome: true } },
          },
        },
      },
    }),
    db.userDepartamento.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds } },
      select: {
        userId: true,
        tenantId: true,
        departamento: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'asc' },
    }),
  ])

  const map = new Map<string, AutorBadge>()
  for (const p of unicos) {
    const membro = membros.find((m) => m.userId === p.autorId && m.tenantId === p.tenantId)
    const rolesDoAutor = roles
      .filter((r) => r.userId === p.autorId && r.tenantId === p.tenantId)
      .map((r) => ({
        nome: r.role.nome,
        isSystem: r.role.isSystem,
        ordem: r.role.ordem,
        departamentoNome: r.role.departamento?.nome ?? null,
      }))
    const principal = escolherCargoPrincipal(rolesDoAutor)
    const tipoSede: TipoSede =
      membro?.sede?.tipo ?? tipoSedeRaizMap.get(p.tenantId) ?? 'SEDE'
    const deptoNomes = memberships
      .filter((m) => m.userId === p.autorId && m.tenantId === p.tenantId)
      .map((m) => m.departamento.nome)
      .filter((nome, i, arr) => arr.indexOf(nome) === i)

    map.set(chave(p.autorId, p.tenantId), {
      sedeNome: membro?.sede?.nome ?? null,
      cargoNome: principal ? rotuloCargoBadge(principal, tipoSede) : null,
      departamentoNome: resolverDepartamentoBadge({
        memberships: deptoNomes,
        roleDepartamento: principal?.departamentoNome ?? null,
        preferencia: membro?.departamento?.nome ?? null,
      }),
    })
  }
  return map
}

export async function enriquecerPostsComBadges(posts: PostSocialItem[]): Promise<PostSocialItem[]> {
  if (posts.length === 0) return posts
  const badges = await getBadgesPorAutorTenant(
    posts.map((p) => ({ autorId: p.autorId, tenantId: p.tenantId })),
  )
  return posts.map((p) => {
    const b = badges.get(chave(p.autorId, p.tenantId))
    if (!b) return p
    return {
      ...p,
      autor: {
        ...p.autor,
        sedeNome: b.sedeNome,
        cargoNome: b.cargoNome,
        departamentoNome: b.departamentoNome,
      },
    }
  })
}
