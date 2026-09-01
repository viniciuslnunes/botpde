import { db } from '@torcida/db'
import { unstable_cache } from 'next/cache'
import { tagAutorBadgesTenant } from './comunidade-cache'
import {
  SYSTEM_ROLES,
  formatNomeTorcida,
  nomeExibicaoAfiliacao,
  rotuloCargoSistema,
} from '@torcida/types'
import type { PostSocialItem } from './feed'

export type TorcidaRealAutor = { tenantId: string; tenantNome: string }

export {
  CARGO_TORCEDOR,
  formatAutorCargoBadge,
  formatCargoComNumeroSocio,
  parseNumeroAssociado,
} from './autor-badges-format'
import {
  CARGO_TORCEDOR,
  formatAutorCargoBadge,
  formatCargoComNumeroSocio,
  parseNumeroAssociado,
} from './autor-badges-format'

type TipoSede = 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'

export interface AutorBadge {
  sedeNome: string | null
  sedeTipo: TipoSede | null
  cargoNome: string | null
  departamentoNome: string | null
}

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

/**
 * "Membro" só faz sentido quando a pessoa compõe algum departamento (ofício).
 * Sem área, o cargo de sistema `member` é "Sócio" — o vínculo real dela com a
 * torcida, e já o rótulo padrão de `rotuloCargoSistema`. Demais cargos não mudam.
 */
export function rotuloCargoBadge(
  role: RoleBadgeLite,
  tipoSede: TipoSede,
  opts?: { temDepartamento?: boolean },
): string {
  if (!role.isSystem) return role.nome
  if (role.nome === SYSTEM_ROLES.MEMBER && opts?.temDepartamento) return 'Membro'
  return rotuloCargoSistema(role.nome, tipoSede)
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
    ['autor-badges-feed-v2', cacheKey],
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
  // "Liderança". Mesmo critério de `getOrganizacaoTree`: existe `tipo: 'SEDE'`
  // no tenant → é a raiz (não depende de `sedeId`, que em Caso B costuma
  // apontar pra fora do tenant — pra Sede-mãe — e não deve ser tratado como
  // "qualquer sede sem pai local == raiz", senão uma Sede de teste/lixo com
  // `sedeId` externo pode ganhar de uma Sede real por ordenação não
  // determinística do `findMany`).
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
    const sedeTipoSede = sedes.find((s) => s.tipo === 'SEDE')
    if (sedeTipoSede) {
      tipoSedeRaizMap.set(tenantId, 'SEDE')
      continue
    }
    const idsDoTenant = new Set(sedes.map((s) => s.id))
    const raiz = sedes.find((s) => !s.sedeId || !idsDoTenant.has(s.sedeId))
    if (raiz) tipoSedeRaizMap.set(tenantId, raiz.tipo)
  }

  const [membros, roles, memberships, carteirinhas, perfis]: [
    Array<{
      userId: string
      tenantId: string
      tipo: 'SOCIO' | 'TORCEDOR'
      numeroAssociado: string | null
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
    Array<{ userId: string; tenantId: string; numeroSocio: number }>,
    Array<{ userId: string; tenantId: string; exibirNumeroSocioNoFeed: boolean }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds }, status: 'APROVADO' },
      select: {
        userId: true,
        tenantId: true,
        tipo: true,
        numeroAssociado: true,
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
    db.saasSocio.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds } },
      select: { userId: true, tenantId: true, numeroSocio: true },
    }),
    db.perfilMembro.findMany({
      where: { userId: { in: autorIds }, tenantId: { in: tenantIds } },
      select: { userId: true, tenantId: true, exibirNumeroSocioNoFeed: true },
    }),
  ])

  const numeroPorChave = new Map(
    carteirinhas.map((c) => [chave(c.userId, c.tenantId), c.numeroSocio]),
  )
  const exibirNumeroPorChave = new Map(
    perfis.map((p) => [chave(p.userId, p.tenantId), p.exibirNumeroSocioNoFeed]),
  )

  const map = new Map<string, AutorBadge>()
  for (const p of unicos) {
    const k = chave(p.autorId, p.tenantId)
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

    const departamentoNome = resolverDepartamentoBadge({
      memberships: deptoNomes,
      roleDepartamento: principal?.departamentoNome ?? null,
      preferencia: membro?.departamento?.nome ?? null,
    })

    let cargoNome = principal
      ? rotuloCargoBadge(principal, tipoSede, { temDepartamento: departamentoNome != null })
      : null
    // Quem não é sócio não vira "Sócio" pelo cargo base de sistema.
    if (membro?.tipo === 'TORCEDOR' && (!cargoNome || cargoNome === 'Sócio')) {
      cargoNome = 'Torcedor'
    }

    // Combina cargo + área antes do Nº → "Membro · Bateria - Nº 1032"
    // (em vez de "Membro - Nº 1032 · Bateria"). A UI reusa formatAutorCargoBadge
    // e curto-circuita quando o cargo já contém a área.
    const badgeBase = formatAutorCargoBadge(cargoNome, departamentoNome)

    // Preferência ausente = default do schema (true): número visível no feed.
    // Carteirinha (`SaasSocio`) manda; ficha (`numeroAssociado`) cobre sócio
    // aprovado ainda sem emissão — comum em canais/unidades de seed.
    const exibirNumero = exibirNumeroPorChave.get(k) ?? true
    const numeroSocio =
      numeroPorChave.get(k) ?? parseNumeroAssociado(membro?.numeroAssociado) ?? null
    cargoNome = formatCargoComNumeroSocio(badgeBase, {
      numeroSocio,
      exibir: exibirNumero && membro?.tipo === 'SOCIO',
    })

    map.set(k, {
      sedeNome: membro?.sede?.nome ?? null,
      sedeTipo: membro?.sede?.tipo ?? null,
      cargoNome,
      departamentoNome,
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

/**
 * Quem ainda não é sócio de TO real não exibe torcida/unidade do convite: a
 * identidade pública é "clube + Torcedor" (ex.: `TIMÃO` · `Torcedor`), até
 * `SaasMembro.tipo === SOCIO`. Vale igual no tenant sintético da CN e na
 * torcida real — antes o sintético caía num rótulo longo e sem pill
 * ("TIMÃO — COMUNIDADE NACIONAL"), divergindo do preview pós-publicação.
 * Sócio no sintético sobe a torcida real (caminho inverso, já existente).
 */
export function deveExibirIdentidadeTorcedor(args: {
  tipoPost: string
  ehSocioDeTorcidaReal: boolean
}): boolean {
  if (args.tipoPost !== 'MEMBRO') return false
  return !args.ehSocioDeTorcidaReal
}

export async function enriquecerPostsComBadges(posts: PostSocialItem[]): Promise<PostSocialItem[]> {
  if (posts.length === 0) return posts

  const tenantIds = [...new Set(posts.map((p) => p.tenantId))]
  const tenants: Array<{ id: string; sintetico: boolean; afiliacaoId: string | null }> =
    await db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, sintetico: true, afiliacaoId: true },
    })

  const tenantMeta = new Map(tenants.map((t) => [t.id, t]))
  const afiliacaoIds = [
    ...new Set(tenants.map((t) => t.afiliacaoId).filter((id): id is string => id != null)),
  ]

  // Rótulo curto do clube ("TIMÃO") — identidade pública de quem ainda não é
  // sócio. Não usa mais o nome do tenant sintético ("… — Comunidade Nacional").
  const clubes: Array<{ id: string; nome: string; apelido: string | null }> =
    afiliacaoIds.length > 0
      ? await db.afiliacao.findMany({
          where: { id: { in: afiliacaoIds } },
          select: { id: true, nome: true, apelido: true },
        })
      : []
  const rotuloClubePorAfiliacao = new Map(clubes.map((c) => [c.id, nomeExibicaoAfiliacao(c)]))

  // Sócio de TO real no clube — tanto para subir badge no sintético quanto
  // para NÃO mascarar posts MEMBRO que vivem na torcida (alcance nacional).
  const torcidaRealPorAutor = new Map<string, TorcidaRealAutor>()
  if (afiliacaoIds.length > 0) {
    const autores = [...new Set(posts.map((p) => p.autorId))]
    await Promise.all(
      afiliacaoIds.map(async (afiliacaoId) => {
        const map = await resolverTorcidaRealPorAutor(autores, afiliacaoId)
        for (const [autorId, torcida] of map) {
          // Feed é por afiliação; em lote misto a 1ª vitória basta (raro).
          if (!torcidaRealPorAutor.has(autorId)) torcidaRealPorAutor.set(autorId, torcida)
        }
      }),
    )
  }

  const badges = await getBadgesPorAutorTenant([
    // Identidade de torcedor não consulta cargo: o pill é fixo e a unidade do
    // convite nunca é exibida.
    ...posts.flatMap((p) => {
      const real = torcidaRealPorAutor.get(p.autorId)
      if (deveExibirIdentidadeTorcedor({ tipoPost: p.tipo, ehSocioDeTorcidaReal: Boolean(real) })) {
        return []
      }
      const emSintetico = tenantMeta.get(p.tenantId)?.sintetico === true
      if (emSintetico && real) return [{ autorId: p.autorId, tenantId: real.tenantId }]
      return [{ autorId: p.autorId, tenantId: p.tenantId }]
    }),
    ...posts.flatMap((p) => {
      const c = p.comunicadoOrigem
      if (!c?.autorId) return []
      return [{ autorId: c.autorId, tenantId: c.tenantId }]
    }),
  ])

  return posts.map((p) => {
    const meta = tenantMeta.get(p.tenantId)
    const real = torcidaRealPorAutor.get(p.autorId)
    const emSintetico = meta?.sintetico === true
    const identidadeTorcedor = deveExibirIdentidadeTorcedor({
      tipoPost: p.tipo,
      ehSocioDeTorcidaReal: Boolean(real),
    })
    const rotuloClube = identidadeTorcedor
      ? (meta?.afiliacaoId ? (rotuloClubePorAfiliacao.get(meta.afiliacaoId) ?? '') : '')
      : null

    const tenantBadgeId = emSintetico && real ? real.tenantId : p.tenantId
    const b = badges.get(chave(p.autorId, tenantBadgeId))

    const comunicado = p.comunicadoOrigem
    const badgeComunicado =
      comunicado?.autorId != null
        ? badges.get(chave(comunicado.autorId, comunicado.tenantId))
        : undefined

    const base = {
      ...p,
      autor: identidadeTorcedor
        ? {
            ...p.autor,
            sedeNome: null,
            sedeTipo: null,
            cargoNome: CARGO_TORCEDOR,
            departamentoNome: null,
          }
        : b
          ? {
              ...p.autor,
              sedeNome: b.sedeNome,
              sedeTipo: b.sedeTipo,
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

    if (identidadeTorcedor) {
      return { ...base, tenant: { nome: rotuloClube ?? '', logoUrl: base.tenant.logoUrl } }
    }
    if (emSintetico && real) {
      return { ...base, tenant: { nome: real.tenantNome, logoUrl: base.tenant.logoUrl } }
    }
    return base
  })
}
