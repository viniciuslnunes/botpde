import { db } from '@torcida/db'
import { formatNomeTorcida, formatNomeUnidade, SYSTEM_ROLES } from '@torcida/types'
import { resolveLogoTenantSemIO, resolveTenantLogoUrl } from '@/lib/tenant'
import { tokensDaBusca } from '@/lib/listagem/query'
import type { ListagemParams } from '@/lib/listagem'
import { labelTipoUnidade } from '@/lib/torcida-labels'
import {
  carregarMapaPortalMae,
  paraTenantRaiz,
} from '@/lib/tenant-hierarquia-plataforma'

/**
 * Console de lideranças do super-admin (`/super-admin/liderancas`).
 *
 * Pagina por **torcida-raiz** (não achata a árvore): cada página hidrata só as
 * raízes pedidas e as filhas delas. Busca e filtros (`escopo`) resolvem o
 * conjunto de raízes no servidor — nunca dump de tenants/sedes/owners.
 *
 * Leitura de estrutura — nunca gateada por canal restrito (ARCHITECTURE §5.13).
 */

export type LinhaLideranca = {
  /** Chave estável da linha (tenantId no Caso B, sedeId no Caso A). */
  id: string
  caso: 'A' | 'B'
  tenantId: string
  /** Caso A: unidade cuja liderança muda. `null` no Caso B. */
  sedeId: string | null
  nome: string
  /**
   * "Torcida", "Subsede", "PDE" — natureza da unidade na árvore, sempre vinda
   * de `Sede.tipo`. Ter portal próprio (Caso B) é detalhe de implementação da
   * liderança (`caso`), **não** uma categoria de unidade: uma subsede promovida
   * continua sendo Subsede.
   */
  tipoLabel: string
  slug: string | null
  corPrimaria: string
  lideres: { userId: string; nome: string | null; email: string | null }[]
  /** O super-admin que abriu a página lidera esta unidade. */
  souEu: boolean
}

export type GrupoLideranca = {
  /** Tenant raiz da torcida (Sede principal). */
  tenantId: string
  nome: string
  clubeLabel: string | null
  corPrimaria: string
  /** Escudo/logo efetivo (`resolveTenantLogoUrl`); `null` cai na inicial. */
  logoUrl: string | null
  raiz: LinhaLideranca
  filhas: LinhaLideranca[]
}

export type LiderancasResumo = {
  torcidas: number
  semLider: number
  sobMinhaPosse: number
}

export type LiderancasPagina = {
  grupos: GrupoLideranca[]
  total: number
  resumo: LiderancasResumo
}

export type SugestaoLideranca = {
  /** Tenant-raiz a abrir (param `raiz` na URL). */
  raizId: string
  label: string
  sublabel: string
  tipo: 'torcida' | 'unidade' | 'lider'
}

type SedeRow = {
  id: string
  nome: string
  tipo: string
  tenantId: string | null
  sedeId: string | null
  fotoUrl: string | null
  responsavelUserId: string | null
  responsavelUser: { nome: string | null; email: string | null } | null
}

type TenantRow = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  logoUrl: string | null
  afiliacao: { nome: string; apelido: string | null; estado: string | null } | null
}

type OwnerRow = {
  tenantId: string
  userId: string
  user: { nome: string | null; email: string | null }
}

function clubeLabel(t: TenantRow): string | null {
  if (!t.afiliacao) return null
  const nome = t.afiliacao.apelido || t.afiliacao.nome
  return t.afiliacao.estado ? `${nome} (${t.afiliacao.estado})` : nome
}

function paraRaiz(tenantId: string, maePorFilho: Map<string, string>): string {
  return paraTenantRaiz(tenantId, maePorFilho)
}

/**
 * Ordem da árvore: Sede, depois Subsede, depois PDE. Tipo desconhecido (portal
 * legado sem a sede da unidade) vai para o fim, não para o topo.
 */
const PESO_HIERARQUIA: Record<string, number> = {
  SEDE: 0,
  SUBSEDE: 1,
  PONTO_ENCONTRO: 2,
}

function pesoHierarquia(tipo: string): number {
  return PESO_HIERARQUIA[tipo] ?? 99
}

async function carregarMapaMae(): Promise<Map<string, string>> {
  return carregarMapaPortalMae()
}

function intersectir(base: Set<string> | null, recorte: Set<string>): Set<string> {
  if (!base) return recorte
  const out = new Set<string>()
  for (const id of recorte) {
    if (base.has(id)) out.add(id)
  }
  return out
}

/** Raízes cuja busca livre casa (torcida, unidade, clube ou líder). */
async function raizesPorBusca(
  q: string,
  maePorFilho: Map<string, string>,
): Promise<Set<string>> {
  const tokens = tokensDaBusca(q)
  if (tokens.length === 0) return new Set()

  let acumulado: Set<string> | null = null

  for (const termo of tokens) {
    const [tenants, sedes, owners, responsaveis]: [
      { id: string }[],
      { tenantId: string | null }[],
      { tenantId: string }[],
      { tenantId: string | null }[],
    ] = await Promise.all([
      db.tenant.findMany({
        where: {
          sintetico: false,
          ativo: true,
          OR: [
            { nome: { contains: termo, mode: 'insensitive' } },
            { slug: { contains: termo, mode: 'insensitive' } },
            {
              afiliacao: {
                OR: [
                  { nome: { contains: termo, mode: 'insensitive' } },
                  { apelido: { contains: termo, mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
        select: { id: true },
        take: 80,
      }),
      db.sede.findMany({
        where: {
          tenantId: { not: null },
          nome: { contains: termo, mode: 'insensitive' },
        },
        select: { tenantId: true },
        take: 80,
      }),
      db.userRole.findMany({
        where: {
          role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
          user: {
            OR: [
              { email: { contains: termo, mode: 'insensitive' } },
              { nome: { contains: termo, mode: 'insensitive' } },
            ],
          },
        },
        select: { tenantId: true },
        take: 40,
      }),
      db.sede.findMany({
        where: {
          tenantId: { not: null },
          responsavelUser: {
            OR: [
              { email: { contains: termo, mode: 'insensitive' } },
              { nome: { contains: termo, mode: 'insensitive' } },
            ],
          },
        },
        select: { tenantId: true },
        take: 40,
      }),
    ])

    const hit = new Set<string>()
    for (const t of tenants) hit.add(paraRaiz(t.id, maePorFilho))
    for (const s of sedes) {
      if (s.tenantId) hit.add(paraRaiz(s.tenantId, maePorFilho))
    }
    for (const o of owners) hit.add(paraRaiz(o.tenantId, maePorFilho))
    for (const r of responsaveis) {
      if (r.tenantId) hit.add(paraRaiz(r.tenantId, maePorFilho))
    }
    acumulado = intersectir(acumulado, hit)
    if (acumulado.size === 0) return acumulado
  }

  return acumulado ?? new Set()
}

async function raizesOndeEuLidero(
  meuUserId: string,
  maePorFilho: Map<string, string>,
): Promise<Set<string>> {
  const [owners, sedes]: [{ tenantId: string }[], { tenantId: string | null }[]] =
    await Promise.all([
      db.userRole.findMany({
        where: {
          userId: meuUserId,
          role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
        },
        select: { tenantId: true },
      }),
      db.sede.findMany({
        where: { responsavelUserId: meuUserId, tenantId: { not: null } },
        select: { tenantId: true },
      }),
    ])

  const hit = new Set<string>()
  for (const o of owners) hit.add(paraRaiz(o.tenantId, maePorFilho))
  for (const s of sedes) {
    if (s.tenantId) hit.add(paraRaiz(s.tenantId, maePorFilho))
  }
  return hit
}

type SedeLite = {
  id: string
  tipo: string
  tenantId: string | null
  sedeId: string | null
  responsavelUserId: string | null
}

/**
 * Raízes com pelo menos uma linha sem liderança (presidência vazia, portal sem
 * owner, ou unidade Caso A sem responsável).
 */
async function raizesComVaga(
  maePorFilho: Map<string, string>,
  idsRaizesCandidatas: string[],
): Promise<Set<string>> {
  if (idsRaizesCandidatas.length === 0) return new Set()

  const candidatas = new Set(idsRaizesCandidatas)
  const portaisDasRaizes = [...maePorFilho.entries()]
    .filter(([, mae]) => candidatas.has(mae))
    .map(([filho]) => filho)
  const tenantsNoEscopo = [...new Set([...idsRaizesCandidatas, ...portaisDasRaizes])]

  const [owners, sedes]: [{ tenantId: string }[], SedeLite[]] = await Promise.all([
    db.userRole.findMany({
      where: {
        tenantId: { in: tenantsNoEscopo },
        role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
      },
      select: { tenantId: true },
    }),
    db.sede.findMany({
      where: { tenantId: { in: tenantsNoEscopo } },
      select: {
        id: true,
        tipo: true,
        tenantId: true,
        sedeId: true,
        responsavelUserId: true,
      },
    }),
  ])

  const comOwner = new Set(owners.map((o) => o.tenantId))
  const sedePorId = new Map(sedes.map((s) => [s.id, s]))
  const hit = new Set<string>()

  for (const raizId of idsRaizesCandidatas) {
    if (!comOwner.has(raizId)) {
      hit.add(raizId)
      continue
    }

    const portais = portaisDasRaizes.filter((p) => maePorFilho.get(p) === raizId)
    let vaga = false
    for (const portalId of portais) {
      if (!comOwner.has(portalId)) {
        vaga = true
        break
      }
      const sedesDoPortal = sedes.filter((s) => s.tenantId === portalId)
      const sedeDoProprioPortal = sedesDoPortal.find(
        (s) => s.sedeId && sedePorId.get(s.sedeId)?.tenantId === raizId,
      )
      for (const sede of sedesDoPortal) {
        if (sede.id === sedeDoProprioPortal?.id) continue
        if (!sede.responsavelUserId) {
          vaga = true
          break
        }
      }
      if (vaga) break
    }
    if (vaga) {
      hit.add(raizId)
      continue
    }

    const sedesDoTenant = sedes.filter((s) => s.tenantId === raizId)
    const raizSedeId = sedesDoTenant.find((s) => s.tipo === 'SEDE')?.id ?? null
    for (const sede of sedesDoTenant) {
      if (sede.id === raizSedeId) continue
      if (!sede.responsavelUserId) {
        hit.add(raizId)
        break
      }
    }
  }

  return hit
}

async function contarLinhasSemLider(): Promise<number> {
  // Contagens leves (sem hidratar árvore): tenants sem owner + sedes sem
  // responsável que não sejam a “cara” do portal (Caso B — liderança = owner).
  const [tenantsSemOwner, sedesSemResp]: [{ n: bigint }[], { n: bigint }[]] =
    await Promise.all([
      db.$queryRaw`
        SELECT COUNT(*)::bigint AS n
        FROM saas_tenants t
        WHERE t.ativo = true
          AND t.sintetico = false
          AND NOT EXISTS (
            SELECT 1
            FROM saas_user_roles ur
            INNER JOIN saas_roles r ON r.id = ur.role_id
            WHERE ur.tenant_id = t.id
              AND r.is_system = true
              AND r.nome = ${SYSTEM_ROLES.OWNER}
          )
      `,
      db.$queryRaw`
        SELECT COUNT(*)::bigint AS n
        FROM saas_sedes s
        WHERE s.tenant_id IS NOT NULL
          AND s.responsavel_user_id IS NULL
          AND s.tipo <> 'SEDE'
          AND NOT EXISTS (
            SELECT 1
            FROM saas_sedes pai
            WHERE pai.id = s.sede_id
              AND pai.tenant_id IS NOT NULL
              AND pai.tenant_id <> s.tenant_id
          )
      `,
    ])

  return Number(tenantsSemOwner[0]?.n ?? BigInt(0)) + Number(sedesSemResp[0]?.n ?? BigInt(0))
}

async function contarSobMinhaPosse(meuUserId: string): Promise<number> {
  const [owners, sedes]: [
    number,
    { tenantId: string | null; sede: { tenantId: string | null } | null }[],
  ] = await Promise.all([
    db.userRole.count({
      where: {
        userId: meuUserId,
        role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
      },
    }),
    db.sede.findMany({
      where: { responsavelUserId: meuUserId, tenantId: { not: null } },
      select: {
        tenantId: true,
        sede: { select: { tenantId: true } },
      },
    }),
  ])

  // Exclui a sede “cara” do portal (Caso B): pai em outro tenant — a posse
  // já conta no owner daquele portal.
  let sedesLinha = 0
  for (const s of sedes) {
    const paiTenant = s.sede?.tenantId ?? null
    if (paiTenant && s.tenantId && paiTenant !== s.tenantId) continue
    sedesLinha += 1
  }

  return owners + sedesLinha
}

function montarGrupo(
  t: TenantRow,
  tenants: TenantRow[],
  sedes: SedeRow[],
  ownersPorTenant: Map<string, OwnerRow[]>,
  maePorFilho: Map<string, string>,
  meuUserId: string,
  extra: { logoUrl: string | null },
): GrupoLideranca {
  const sedePorId = new Map(sedes.map((s) => [s.id, s]))

  function linhaTenant(tenant: TenantRow, tipoLabel: string): LinhaLideranca {
    const lideres = (ownersPorTenant.get(tenant.id) ?? []).map((o) => ({
      userId: o.userId,
      nome: o.user.nome,
      email: o.user.email,
    }))
    return {
      id: tenant.id,
      caso: 'B',
      tenantId: tenant.id,
      sedeId: null,
      nome: formatNomeTorcida(tenant.nome),
      tipoLabel,
      slug: tenant.slug,
      corPrimaria: tenant.corPrimaria,
      lideres,
      souEu: lideres.some((l) => l.userId === meuUserId),
    }
  }

  function linhaSede(sede: SedeRow, corPrimaria: string): LinhaLideranca {
    const lideres = sede.responsavelUserId
      ? [
          {
            userId: sede.responsavelUserId,
            nome: sede.responsavelUser?.nome ?? null,
            email: sede.responsavelUser?.email ?? null,
          },
        ]
      : []
    return {
      id: sede.id,
      caso: 'A',
      tenantId: sede.tenantId!,
      sedeId: sede.id,
      nome: formatNomeUnidade(sede.nome),
      tipoLabel: labelTipoUnidade(sede.tipo),
      slug: null,
      corPrimaria,
      lideres,
      souEu: sede.responsavelUserId === meuUserId,
    }
  }

  // Uma lista só, ordenada por hierarquia e depois pelo nome — ter portal
  // próprio não muda o lugar da unidade na árvore, então Caso A e Caso B se
  // misturam. Sem isso os portais vinham em bloco no topo, fora de ordem.
  const filhasOrdenaveis: { linha: LinhaLideranca; tipo: string }[] = []

  for (const outro of tenants) {
    if (maePorFilho.get(outro.id) !== t.id) continue

    const sedesDoPortal = sedes.filter((s) => s.tenantId === outro.id)
    // A "cara" do portal é a própria unidade promovida — é dela que sai o tipo
    // da linha. Sem ela (dado legado), cai em "Unidade" em vez de inventar.
    const sedeDoProprioPortal = sedesDoPortal.find(
      (s) => s.sedeId && sedePorId.get(s.sedeId)?.tenantId === t.id,
    )
    const tipoPortal = sedeDoProprioPortal?.tipo ?? ''
    filhasOrdenaveis.push({
      linha: linhaTenant(outro, tipoPortal ? labelTipoUnidade(tipoPortal) : 'Unidade'),
      tipo: tipoPortal,
    })

    for (const sede of sedesDoPortal) {
      if (sede.id === sedeDoProprioPortal?.id) continue
      filhasOrdenaveis.push({ linha: linhaSede(sede, outro.corPrimaria), tipo: sede.tipo })
    }
  }

  const sedesDoTenant = sedes.filter((s) => s.tenantId === t.id)
  const raizSedeId = sedesDoTenant.find((s) => s.tipo === 'SEDE')?.id ?? null
  for (const sede of sedesDoTenant) {
    if (sede.id === raizSedeId) continue
    filhasOrdenaveis.push({ linha: linhaSede(sede, t.corPrimaria), tipo: sede.tipo })
  }

  filhasOrdenaveis.sort((a, b) => {
    const peso = pesoHierarquia(a.tipo) - pesoHierarquia(b.tipo)
    if (peso !== 0) return peso
    // `sensitivity: 'base'` porque nome de portal vem em caixa alta
    // (`formatNomeTorcida`) e o de Sede em capitalizado — sem isso "SUBSEDE
    // RIO CLARO" e "Subsede ABC" ordenariam em blocos separados.
    return a.linha.nome.localeCompare(b.linha.nome, 'pt-BR', { sensitivity: 'base' })
  })
  const filhas: LinhaLideranca[] = filhasOrdenaveis.map((f) => f.linha)

  return {
    tenantId: t.id,
    nome: formatNomeTorcida(t.nome),
    clubeLabel: clubeLabel(t),
    corPrimaria: t.corPrimaria,
    logoUrl: extra.logoUrl,
    raiz: linhaTenant(t, 'Torcida'),
    filhas,
  }
}

/**
 * Hidrata só as torcidas-raiz pedidas (página atual) — sedes/owners escopados
 * aos tenants da árvore dessas raízes.
 */
async function hidratarGrupos(
  raizIds: string[],
  maePorFilho: Map<string, string>,
  meuUserId: string,
): Promise<GrupoLideranca[]> {
  if (raizIds.length === 0) return []

  const portalIds = [...maePorFilho.entries()]
    .filter(([, mae]) => raizIds.includes(mae))
    .map(([filho]) => filho)
  const tenantIds = [...new Set([...raizIds, ...portalIds])]

  const [tenants, sedes, owners]: [TenantRow[], SedeRow[], OwnerRow[]] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: {
        id: true,
        slug: true,
        nome: true,
        corPrimaria: true,
        logoUrl: true,
        afiliacao: { select: { nome: true, apelido: true, estado: true } },
      },
    }),
    db.sede.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        id: true,
        nome: true,
        tipo: true,
        tenantId: true,
        sedeId: true,
        fotoUrl: true,
        responsavelUserId: true,
        responsavelUser: { select: { nome: true, email: true } },
      },
      orderBy: { nome: 'asc' },
    }),
    db.userRole.findMany({
      where: {
        tenantId: { in: tenantIds },
        role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
      },
      select: {
        tenantId: true,
        userId: true,
        user: { select: { nome: true, email: true } },
      },
    }),
  ])

  const ownersPorTenant = new Map<string, OwnerRow[]>()
  for (const o of owners) {
    const lista = ownersPorTenant.get(o.tenantId)
    if (lista) lista.push(o)
    else ownersPorTenant.set(o.tenantId, [o])
  }

  // Escudo da torcida pela cascata canônica. Os dois primeiros degraus (foto da
  // sede raiz, logo do Design) saem das linhas já carregadas acima; só quem não
  // resolver aí paga as queries de canal — em paralelo, nunca uma por raiz em
  // série.
  const logoPorTenant = new Map<string, string | null>()
  const pendentes: TenantRow[] = []
  for (const id of raizIds) {
    const t = tenants.find((x) => x.id === id)
    if (!t) continue
    const direto = resolveLogoTenantSemIO(
      sedes.filter((s) => s.tenantId === t.id),
      t.logoUrl,
    )
    if (direto) logoPorTenant.set(t.id, direto)
    else pendentes.push(t)
  }
  if (pendentes.length > 0) {
    const resolvidos = await Promise.all(
      pendentes.map((t) => resolveTenantLogoUrl(t.id, t.logoUrl)),
    )
    pendentes.forEach((t, i) => logoPorTenant.set(t.id, resolvidos[i] ?? null))
  }

  const tenantPorId = new Map(tenants.map((t) => [t.id, t]))
  const grupos: GrupoLideranca[] = []
  for (const id of raizIds) {
    const t = tenantPorId.get(id)
    if (!t) continue
    grupos.push(
      montarGrupo(t, tenants, sedes, ownersPorTenant, maePorFilho, meuUserId, {
        logoUrl: logoPorTenant.get(t.id) ?? null,
      }),
    )
  }
  return grupos
}

/**
 * Lista paginada de torcidas-raiz com árvore hidratada. `raizId` (autocomplete)
 * força uma única raiz e ignora busca/filtros de texto conflitantes.
 */
export async function carregarLiderancas(
  meuUserId: string,
  listagem: ListagemParams,
  opcoes: { raizId?: string | null } = {},
): Promise<LiderancasPagina> {
  const maePorFilho = await carregarMapaMae()
  const portais = [...maePorFilho.keys()]

  const [resumoTorcidas, resumoSemLider, resumoMinhas]: [number, number, number] =
    await Promise.all([
      db.tenant.count({
        where: {
          ativo: true,
          sintetico: false,
          ...(portais.length > 0 ? { id: { notIn: portais } } : {}),
        },
      }),
      contarLinhasSemLider(),
      contarSobMinhaPosse(meuUserId),
    ])

  const resumo: LiderancasResumo = {
    torcidas: resumoTorcidas,
    semLider: resumoSemLider,
    sobMinhaPosse: resumoMinhas,
  }

  const raizFixa = opcoes.raizId?.trim() || null
  if (raizFixa) {
    const raizCanonica = paraRaiz(raizFixa, maePorFilho)
    const ok: { id: string } | null = await db.tenant.findFirst({
      where: {
        id: raizCanonica,
        ativo: true,
        sintetico: false,
      },
      select: { id: true },
    })
    // Portal nunca é “raiz” da listagem — se o id fixo for portal, sobe à mãe.
    if (!ok || portais.includes(raizCanonica)) {
      return { grupos: [], total: 0, resumo }
    }
    const grupos = await hidratarGrupos([raizCanonica], maePorFilho, meuUserId)
    return { grupos, total: grupos.length, resumo }
  }

  let candidatas: Set<string> | null = null

  if (listagem.q.trim()) {
    candidatas = await raizesPorBusca(listagem.q, maePorFilho)
  }

  const escopo = listagem.filtros.escopo?.[0] ?? null
  if (escopo === 'minhas') {
    const minhas = await raizesOndeEuLidero(meuUserId, maePorFilho)
    candidatas = intersectir(candidatas, minhas)
  }

  const orderBy =
    listagem.sort === 'criadoEm'
      ? ({ criadoEm: listagem.dir } as const)
      : ({ nome: listagem.dir } as const)

  const whereRaiz = {
    ativo: true as const,
    sintetico: false as const,
    ...(portais.length > 0 ? { id: { notIn: portais } } : {}),
    ...(candidatas ? { id: { in: [...candidatas] } } : {}),
  }

  // Caminho leve: sem filtro que exige varrer a árvore, pagina direto no banco.
  if (escopo !== 'sem-lider') {
    const [paginaIds, total]: [{ id: string }[], number] = await Promise.all([
      db.tenant.findMany({
        where: whereRaiz,
        select: { id: true },
        orderBy,
        skip: (listagem.pagina - 1) * listagem.porPagina,
        take: listagem.porPagina,
      }),
      db.tenant.count({ where: whereRaiz }),
    ])
    const grupos = await hidratarGrupos(
      paginaIds.map((r) => r.id),
      maePorFilho,
      meuUserId,
    )
    return { grupos, total, resumo }
  }

  const todasRaizes: { id: string }[] = await db.tenant.findMany({
    where: whereRaiz,
    select: { id: true },
    orderBy,
  })
  const comVaga = await raizesComVaga(
    maePorFilho,
    todasRaizes.map((r) => r.id),
  )
  const idsOrdenados = todasRaizes.map((r) => r.id).filter((id) => comVaga.has(id))
  const total = idsOrdenados.length
  const skip = (listagem.pagina - 1) * listagem.porPagina
  const paginaIds = idsOrdenados.slice(skip, skip + listagem.porPagina)
  const grupos = await hidratarGrupos(paginaIds, maePorFilho, meuUserId)

  return { grupos, total, resumo }
}

/**
 * Typeahead do console — poucas sugestões, já com `raizId` para deep-link.
 */
export async function sugerirLiderancas(
  q: string,
  limite = 12,
): Promise<SugestaoLideranca[]> {
  const termo = q.trim()
  if (termo.length < 2) return []

  const maePorFilho = await carregarMapaMae()

  const [tenants, sedes, lideresTenant, lideresSede]: [
    TenantRow[],
    { id: string; nome: string; tipo: string; tenantId: string | null }[],
    { tenantId: string; user: { nome: string | null; email: string | null } }[],
    {
      nome: string
      tenantId: string | null
      responsavelUser: { nome: string | null; email: string | null } | null
    }[],
  ] = await Promise.all([
    db.tenant.findMany({
      where: {
        sintetico: false,
        ativo: true,
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { slug: { contains: termo, mode: 'insensitive' } },
          {
            afiliacao: {
              OR: [
                { nome: { contains: termo, mode: 'insensitive' } },
                { apelido: { contains: termo, mode: 'insensitive' } },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        nome: true,
        corPrimaria: true,
        afiliacao: { select: { nome: true, apelido: true, estado: true } },
      },
      take: limite,
      orderBy: { nome: 'asc' },
    }),
    db.sede.findMany({
      where: {
        tenantId: { not: null },
        nome: { contains: termo, mode: 'insensitive' },
      },
      select: { id: true, nome: true, tipo: true, tenantId: true },
      take: limite,
      orderBy: { nome: 'asc' },
    }),
    db.userRole.findMany({
      where: {
        role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
        user: {
          OR: [
            { email: { contains: termo, mode: 'insensitive' } },
            { nome: { contains: termo, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        tenantId: true,
        user: { select: { nome: true, email: true } },
      },
      take: 8,
    }),
    db.sede.findMany({
      where: {
        tenantId: { not: null },
        responsavelUser: {
          OR: [
            { email: { contains: termo, mode: 'insensitive' } },
            { nome: { contains: termo, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        nome: true,
        tenantId: true,
        responsavelUser: { select: { nome: true, email: true } },
      },
      take: 8,
    }),
  ])

  // Tipo da unidade promovida, para o portal aparecer como "Subsede"/"PDE" —
  // mesma regra da listagem: ter tenant próprio não muda o que a unidade é.
  const idsPortais = tenants.filter((t) => maePorFilho.has(t.id)).map((t) => t.id)
  const tipoPorPortal = new Map<string, string>()
  if (idsPortais.length > 0) {
    const carasDePortal: {
      tenantId: string | null
      tipo: string
      sede: { tenantId: string | null } | null
    }[] = await db.sede.findMany({
      where: { tenantId: { in: idsPortais }, sede: { tenantId: { not: null } } },
      select: { tenantId: true, tipo: true, sede: { select: { tenantId: true } } },
    })
    for (const s of carasDePortal) {
      // Só a unidade promovida tem pai em OUTRO tenant; as sedes internas do
      // portal têm o próprio portal como pai e não devem sobrescrever o tipo.
      if (!s.tenantId || s.sede?.tenantId === s.tenantId) continue
      tipoPorPortal.set(s.tenantId, s.tipo)
    }
  }

  const vistos = new Set<string>()
  const out: SugestaoLideranca[] = []

  function push(s: SugestaoLideranca) {
    const chave = `${s.tipo}:${s.raizId}:${s.label}`
    if (vistos.has(chave)) return
    vistos.add(chave)
    out.push(s)
  }

  for (const t of tenants) {
    const raizId = paraRaiz(t.id, maePorFilho)
    const ehPortal = maePorFilho.has(t.id)
    push({
      raizId,
      label: formatNomeTorcida(t.nome),
      sublabel: ehPortal
        ? labelTipoUnidade(tipoPorPortal.get(t.id) ?? 'Unidade')
        : clubeLabel(t) ?? t.slug,
      tipo: ehPortal ? 'unidade' : 'torcida',
    })
    if (out.length >= limite) return out
  }

  for (const s of sedes) {
    if (!s.tenantId) continue
    push({
      raizId: paraRaiz(s.tenantId, maePorFilho),
      label: formatNomeUnidade(s.nome),
      sublabel: labelTipoUnidade(s.tipo),
      tipo: 'unidade',
    })
    if (out.length >= limite) return out
  }

  for (const o of lideresTenant) {
    push({
      raizId: paraRaiz(o.tenantId, maePorFilho),
      label: o.user.email ?? o.user.nome ?? 'Líder',
      sublabel: o.user.nome && o.user.email ? o.user.nome : 'Presidência',
      tipo: 'lider',
    })
    if (out.length >= limite) return out
  }

  for (const s of lideresSede) {
    if (!s.tenantId) continue
    push({
      raizId: paraRaiz(s.tenantId, maePorFilho),
      label: s.responsavelUser?.email ?? s.responsavelUser?.nome ?? 'Líder',
      sublabel: formatNomeUnidade(s.nome),
      tipo: 'lider',
    })
    if (out.length >= limite) return out
  }

  return out
}

/** Achata os grupos — útil em testes. */
export function linhasDeLideranca(grupos: GrupoLideranca[]): LinhaLideranca[] {
  return grupos.flatMap((g) => [g.raiz, ...g.filhas])
}
