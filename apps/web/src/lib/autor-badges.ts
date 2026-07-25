import { db } from '@torcida/db'
import { unstable_cache } from 'next/cache'
import { tagAutorBadgesTenant } from './comunidade-cache'
import { SYSTEM_ROLES, formatNomeTorcida, rotuloCargoSistema } from '@torcida/types'
import type { PostSocialItem } from './feed'

export type TorcidaRealAutor = { tenantId: string; tenantNome: string }

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

  const cacheKey = [...unicos]
    .map((p) => chave(p.autorId, p.tenantId))
    .sort()
    .join('|')

  const serializado = await unstable_cache(
    async (): Promise<Array<[string, AutorBadge]>> => {
      const map = await carregarBadgesPorAutorTenant(unicos)
      return [...map.entries()]
    },
    ['autor-badges-feed', cacheKey],
    {
      revalidate: 120,
      tags: [...new Set(unicos.map((p) => tagAutorBadgesTenant(p.tenantId)))],
    },
  )()

  return new Map(serializado)
}

async function carregarBadgesPorAutorTenant(
  unicos: Array<{ autorId: string; tenantId: string }>,
): Promise<Map<string, AutorBadge>> {
  const autorIds = [...new Set(unicos.map((p) => p.autorId))]
  const tenantIds = [...new Set(unicos.map((p) => p.tenantId))]

  // `tipoSede` do badge usa a Sede raiz do tenant (não a unidade pessoal do
  // membro — ver uso abaixo), em vez de assumir 'SEDE' — senão uma subsede/PDE
  // promovida a tenant próprio (Caso B) exibe "Presidente" em vez de
  // "Liderança". Uma unidade promovida mantém Sede.sedeId apontando pra
  // Sede-mãe (outro tenant), então a raiz não é identificável por
  // `sedeId: null` — e se ela tiver filhos territoriais movidos junto (mesmo
  // tenantId), a raiz é a única cujo `sedeId` não aponta pra outra Sede do
  // mesmo tenant.
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
      tipo: 'SOCIO' | 'TORCEDOR'
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
        tipo: true,
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
    // Cargo de sistema (Presidente/Liderança) é sempre relativo à Sede raiz do
    // tenant, não à unidade pessoal do membro — um Presidente pode estar
    // cadastrado numa subsede/PDE e continua Presidente da torcida inteira.
    const tipoSede: TipoSede =
      tipoSedeRaizMap.get(p.tenantId) ?? membro?.sede?.tipo ?? 'SEDE'
    const deptoNomes = memberships
      .filter((m) => m.userId === p.autorId && m.tenantId === p.tenantId)
      .map((m) => m.departamento.nome)
      .filter((nome, i, arr) => arr.indexOf(nome) === i)

    let cargoNome = principal ? rotuloCargoBadge(principal, tipoSede) : null
    if (!cargoNome && membro?.tipo === 'TORCEDOR') {
      cargoNome = 'Torcedor'
    }

    map.set(chave(p.autorId, p.tenantId), {
      sedeNome: membro?.sede?.nome ?? null,
      cargoNome,
      departamentoNome: resolverDepartamentoBadge({
        memberships: deptoNomes,
        roleDepartamento: principal?.departamentoNome ?? null,
        preferencia: membro?.departamento?.nome ?? null,
      }),
    })
  }
  return map
}

/** Sócio aprovado com torcida real no clube — mesmo critério de `resolveUserTenantSlugForUser`. */
export async function getTorcidaRealDoAutor(
  autorId: string,
  afiliacaoId: string,
  opts?: { tenantPreferidoId?: string },
): Promise<TorcidaRealAutor | null> {
  const filtroBase = {
    userId: autorId,
    status: 'APROVADO' as const,
    tipo: 'SOCIO' as const,
    tenant: { afiliacaoId, sintetico: false, ativo: true },
  }

  if (opts?.tenantPreferidoId) {
    const preferido: {
      tenant: { id: string; nome: string }
    } | null = await db.saasMembro.findFirst({
      where: { ...filtroBase, tenantId: opts.tenantPreferidoId },
      select: { tenant: { select: { id: true, nome: true } } },
    })
    if (preferido) {
      return {
        tenantId: preferido.tenant.id,
        tenantNome: formatNomeTorcida(preferido.tenant.nome),
      }
    }
  }

  const membro: {
    tenant: { id: string; nome: string }
  } | null = await db.saasMembro.findFirst({
    where: filtroBase,
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { id: true, nome: true } } },
  })
  if (!membro) return null
  return {
    tenantId: membro.tenant.id,
    tenantNome: formatNomeTorcida(membro.tenant.nome),
  }
}

/** Mapa autor → torcida real (batch) para posts no tenant sintético da CN. */
export async function resolverTorcidaRealPorAutor(
  autorIds: string[],
  afiliacaoId: string,
): Promise<Map<string, TorcidaRealAutor>> {
  const unicos = [...new Set(autorIds)]
  if (unicos.length === 0) return new Map()

  const membros: Array<{
    userId: string
    tenant: { id: string; nome: string }
  }> = await db.saasMembro.findMany({
    where: {
      userId: { in: unicos },
      status: 'APROVADO',
      tipo: 'SOCIO',
      tenant: { afiliacaoId, sintetico: false, ativo: true },
    },
    orderBy: { criadoEm: 'desc' },
    select: {
      userId: true,
      tenant: { select: { id: true, nome: true } },
    },
  })

  const map = new Map<string, TorcidaRealAutor>()
  for (const m of membros) {
    if (map.has(m.userId)) continue
    map.set(m.userId, {
      tenantId: m.tenant.id,
      tenantNome: formatNomeTorcida(m.tenant.nome),
    })
  }
  return map
}

export async function enriquecerPostsComBadges(posts: PostSocialItem[]): Promise<PostSocialItem[]> {
  if (posts.length === 0) return posts

  const tenantIds = [...new Set(posts.map((p) => p.tenantId))]
  const tenants: Array<{ id: string; sintetico: boolean; afiliacaoId: string | null }> =
    await db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, sintetico: true, afiliacaoId: true },
    })

  const sinteticoPorTenant = new Map<string, string>()
  for (const t of tenants) {
    if (t.sintetico && t.afiliacaoId) sinteticoPorTenant.set(t.id, t.afiliacaoId)
  }

  const torcidaRealPorAutor = new Map<string, TorcidaRealAutor>()
  if (sinteticoPorTenant.size > 0) {
    const autoresSintetico = [
      ...new Set(
        posts.filter((p) => sinteticoPorTenant.has(p.tenantId)).map((p) => p.autorId),
      ),
    ]
    const afiliacaoIds = [...new Set(sinteticoPorTenant.values())]
    await Promise.all(
      afiliacaoIds.map(async (afiliacaoId) => {
        const map = await resolverTorcidaRealPorAutor(autoresSintetico, afiliacaoId)
        for (const [autorId, torcida] of map) torcidaRealPorAutor.set(autorId, torcida)
      }),
    )
  }

  const badges = await getBadgesPorAutorTenant([
    ...posts.map((p) => {
      const real = torcidaRealPorAutor.get(p.autorId)
      const tenantBadgeId =
        sinteticoPorTenant.has(p.tenantId) && real ? real.tenantId : p.tenantId
      return { autorId: p.autorId, tenantId: tenantBadgeId }
    }),
    ...posts.flatMap((p) => {
      const c = p.comunicadoOrigem
      if (!c?.autorId) return []
      return [{ autorId: c.autorId, tenantId: c.tenantId }]
    }),
  ])

  return posts.map((p) => {
    const real = torcidaRealPorAutor.get(p.autorId)
    const emSintetico = sinteticoPorTenant.has(p.tenantId)
    const tenantBadgeId = emSintetico && real ? real.tenantId : p.tenantId
    const b = badges.get(chave(p.autorId, tenantBadgeId))

    const comunicado = p.comunicadoOrigem
    const badgeComunicado =
      comunicado?.autorId != null
        ? badges.get(chave(comunicado.autorId, comunicado.tenantId))
        : undefined

    const base = {
      ...p,
      autor: b
        ? {
            ...p.autor,
            sedeNome: b.sedeNome,
            cargoNome: b.cargoNome,
            departamentoNome: b.departamentoNome,
          }
        : p.autor,
      comunicadoOrigem:
        comunicado && badgeComunicado
          ? {
              ...comunicado,
              autorCargoNome: badgeComunicado.cargoNome,
              autorDepartamentoNome: badgeComunicado.departamentoNome,
            }
          : comunicado,
    }

    if (emSintetico && real) {
      return { ...base, tenant: { nome: real.tenantNome, logoUrl: base.tenant.logoUrl } }
    }
    return base
  })
}
