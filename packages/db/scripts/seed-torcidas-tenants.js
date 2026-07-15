/**
 * Provisionamento nacional de tenants a partir do catálogo TorcidaConhecida
 * (Tenant + Sede + cargos de sistema, sem owner — transferível via super-admin).
 *
 * Lê do BANCO as torcidas conhecidas com Afiliacao resolvida e cria/atualiza
 * o Tenant correspondente, linkado por `torcidaConhecidaId` (idempotente).
 *
 *   pnpm --filter @torcida/db seed:torcidas-tenants
 *   pnpm --filter @torcida/db seed:torcidas-tenants -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../types/src/permissions.js'
import { normalizeNome, chaveMatch, saoMesmoClube } from '../src/data/afiliacoes-normalize.js'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'
import { upsertDepartamentosCanonicos } from '../src/departamentos-canonicos.js'

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

const SYSTEM_ROLE_DEFS = [
  {
    nome: SYSTEM_ROLES.OWNER,
    cor: '#f59e0b',
    ordem: 100,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER],
  },
  {
    nome: SYSTEM_ROLES.VICE,
    cor: '#0ea5e9',
    ordem: 95,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE],
  },
  {
    nome: SYSTEM_ROLES.ADMIN,
    cor: '#3b82f6',
    ordem: 90,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
  },
  {
    nome: SYSTEM_ROLES.MEMBER,
    cor: '#6b7280',
    ordem: 0,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
  },
]

async function ensureSystemRoles(tenantId) {
  for (const roleData of SYSTEM_ROLE_DEFS) {
    await db.role.upsert({
      where: { tenantId_nome: { tenantId, nome: roleData.nome } },
      update: { permissions: roleData.permissions },
      create: {
        tenantId,
        nome: roleData.nome,
        cor: roleData.cor,
        ordem: roleData.ordem,
        isSystem: true,
        permissions: roleData.permissions,
      },
    })
  }
  await upsertDepartamentosCanonicos(db, tenantId)
}

/**
 * Slug único para um tenant novo: usa o slug do catálogo; em colisão com
 * outro tenant não-linkado, sufixa `-t`, `-t2`, `-t3`… (Set mutado.)
 * @param {string} slugCatalogo
 * @param {Set<string>} usados
 * @returns {string}
 */
function slugUnicoParaTenant(slugCatalogo, usados) {
  const base = normalizeNome(slugCatalogo).replace(/\s+/g, '-') || 'torcida'
  if (!usados.has(base)) {
    usados.add(base)
    return base
  }
  let slug = `${base}-t`
  let n = 2
  while (usados.has(slug)) {
    slug = `${base}-t${n}`
    n += 1
  }
  usados.add(slug)
  return slug
}

/** Nomes equivalentes (ex.: "Gaviões da Fiel" ↔ "Gaviões da Fiel Torcida"). */
function nomesEquivalentes(a, b) {
  const na = normalizeNome(a)
  const nb = normalizeNome(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.startsWith(nb) || nb.startsWith(na)
}

/**
 * Consolida tenants duplicados: prioriza o tenant âncora (sem link, ex. pde-gavioes-fiel)
 * e remove o vazio criado pelo catálogo quando nomes equivalentes no mesmo clube.
 * @param {boolean} dryRun
 */
async function limparDuplicatasCatalogo(dryRun) {
  const afiliacoes = await db.afiliacao.findMany({ select: { id: true, nome: true, estado: true } })
  /** @type {AfiliacaoRow[][]} */
  const grupos = []
  const usados = new Set()
  for (const a of afiliacoes) {
    if (usados.has(a.id)) continue
    const grupo = afiliacoes.filter((b) => !usados.has(b.id) && saoMesmoClube(a, b))
    for (const g of grupo) usados.add(g.id)
    grupos.push(grupo)
  }
  /** @param {string|null} id */
  function idsEquivalentes(id) {
    if (!id) return new Set()
    for (const grupo of grupos) {
      if (grupo.some((a) => a.id === id)) return new Set(grupo.map((a) => a.id))
    }
    return new Set([id])
  }

  const [comLink, semLink] = await Promise.all([
    db.tenant.findMany({
      where: { torcidaConhecidaId: { not: null } },
      select: {
        id: true,
        slug: true,
        nome: true,
        afiliacaoId: true,
        torcidaConhecidaId: true,
        logoUrl: true,
        _count: { select: { membros: true } },
      },
    }),
    db.tenant.findMany({
      where: { torcidaConhecidaId: null, ativo: true },
      select: { id: true, slug: true, nome: true, afiliacaoId: true, logoUrl: true },
    }),
  ])

  let removidos = 0
  let consolidados = 0

  /** @param {{ id: string, slug: string, logoUrl: string|null, afiliacaoId: string|null }} canon @param {{ id: string, torcidaConhecidaId: string|null, logoUrl: string|null, afiliacaoId: string|null, slug?: string }} dupe @param {boolean} dryRun */
  async function consolidarPar(canon, dupe, dryRun) {
    if (dryRun) {
      console.log(`  · [dedup] ${canon.slug} ← ${dupe.slug ?? dupe.id}`)
      return
    }
    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: dupe.id },
        data: { torcidaConhecidaId: null },
      })
      await tx.tenant.update({
        where: { id: canon.id },
        data: {
          torcidaConhecidaId: dupe.torcidaConhecidaId,
          logoUrl: canon.logoUrl ?? dupe.logoUrl,
          afiliacaoId: canon.afiliacaoId ?? dupe.afiliacaoId,
        },
      })
      await tx.sede.deleteMany({ where: { tenantId: dupe.id } })
      await tx.role.deleteMany({ where: { tenantId: dupe.id } })
      await tx.tenant.delete({ where: { id: dupe.id } })
    })
    const idx = comLink.findIndex((d) => d.id === dupe.id)
    if (idx >= 0) comLink.splice(idx, 1)
  }

  for (const canon of semLink) {
    if (!canon.afiliacaoId) continue
    const dupes = comLink.filter(
      (d) =>
        idsEquivalentes(canon.afiliacaoId).has(d.afiliacaoId ?? '')
        && d._count.membros === 0
        && nomesEquivalentes(d.nome, canon.nome),
    )
    for (const dupe of dupes) {
      await consolidarPar(canon, dupe, dryRun)
      removidos += dryRun ? 0 : 1
      consolidados += 1
    }
  }

  // Segunda passagem: tenants âncora do dataset curado (slug explícito).
  for (const tb of TORCIDAS_BRASIL) {
    const canon = semLink.find((t) => t.slug === tb.slug)
    if (!canon || !canon.afiliacaoId) continue
    const afiliacaoIds = idsEquivalentes(canon.afiliacaoId)
    const dupe = comLink.find(
      (d) =>
        d._count.membros === 0
        && d.afiliacaoId
        && afiliacaoIds.has(d.afiliacaoId)
        && (nomesEquivalentes(d.nome, tb.nome) || nomesEquivalentes(d.nome, canon.nome)),
    )
    if (!dupe) continue
    await consolidarPar(canon, dupe, dryRun)
    removidos += dryRun ? 0 : 1
    consolidados += 1
  }

  if (consolidados > 0) {
    console.log(`Dedup: ${consolidados} par(es) consolidado(s)${dryRun ? ' (dry-run)' : `, ${removidos} removido(s)`}`)
  }
}

/**
 * @param {{ id: string, nome: string, titulo: string|null, afiliacaoId: string|null }} tc
 * @param {Array<{ id: string, slug: string, nome: string, afiliacaoId: string|null, torcidaConhecidaId: string|null }>} tenantsExistentes
 * @param {Map<string, { id: string, slug: string }>} tenantPorNomeAfiliacao
 * @param {Map<string, { id: string, slug: string, torcidaConhecidaId: string|null }>} tenantPorSlug
 * @param {(id: string|null) => Set<string>} idsEquivalentes
 */
function resolverTenantExistente(tc, tenantsExistentes, tenantPorNomeAfiliacao, tenantPorSlug, idsEquivalentes) {
  if (!tc.afiliacaoId) return undefined
  const nome = tc.titulo ?? tc.nome
  const afiliacaoIds = idsEquivalentes(tc.afiliacaoId)

  for (const afId of afiliacaoIds) {
    const exato =
      tenantPorNomeAfiliacao.get(`${normalizeNome(nome)}|${afId}`)
      ?? tenantPorNomeAfiliacao.get(`${normalizeNome(tc.nome)}|${afId}`)
    if (exato) return exato
  }

  for (const t of tenantsExistentes) {
    if (!t.afiliacaoId || !afiliacaoIds.has(t.afiliacaoId) || t.torcidaConhecidaId) continue
    if (nomesEquivalentes(t.nome, nome) || nomesEquivalentes(t.nome, tc.nome)) {
      return { id: t.id, slug: t.slug }
    }
  }

  for (const tb of TORCIDAS_BRASIL) {
    if (!nomesEquivalentes(tb.nome, nome) && !nomesEquivalentes(tb.nome, tc.nome)) continue
    const bySlug = tenantPorSlug.get(tb.slug)
    if (bySlug && !bySlug.torcidaConhecidaId) return { id: bySlug.id, slug: bySlug.slug }
  }

  return undefined
}

async function main() {
  /**
   * @type {Array<{ id: string, nome: string, titulo: string|null, slug: string,
   *   afiliacaoId: string|null, logoUrl: string|null, sede: string|null,
   *   cidade: string|null, uf: string|null }>}
   */
  const conhecidas = await db.torcidaConhecida.findMany({
    where: { afiliacaoId: { not: null } },
    select: {
      id: true,
      nome: true,
      titulo: true,
      slug: true,
      afiliacaoId: true,
      logoUrl: true,
      sede: true,
      cidade: true,
      uf: true,
    },
    orderBy: { nome: 'asc' },
  })

  console.log(`Provisionamento de tenants — ${conhecidas.length} torcidas conhecidas com clube.`)
  if (DRY_RUN) console.log('(dry-run: sem gravação)')

  await limparDuplicatasCatalogo(DRY_RUN)

  const afiliacoes = await db.afiliacao.findMany({ select: { id: true, nome: true, estado: true } })
  /** @type {Map<string, Set<string>>} */
  const grupoAfiliacao = new Map()
  /** @param {string|null|undefined} nome @param {string|null|undefined} uf */
  function chaveClube(nome, uf) {
    return `${chaveMatch(nome ?? '')}|${normalizeNome(uf ?? '')}`
  }
  for (const a of afiliacoes) {
    const chave = chaveClube(a.nome, a.estado)
    const set = grupoAfiliacao.get(chave) ?? new Set()
    set.add(a.id)
    grupoAfiliacao.set(chave, set)
  }
  /** @param {string|null} id */
  function idsEquivalentes(id) {
    if (!id) return new Set()
    for (const set of grupoAfiliacao.values()) {
      if (set.has(id)) return set
    }
    return new Set([id])
  }

  /** @type {Array<{ id: string, slug: string, nome: string, afiliacaoId: string|null, torcidaConhecidaId: string|null }>} */
  const tenantsExistentes = await db.tenant.findMany({
    select: { id: true, slug: true, nome: true, afiliacaoId: true, torcidaConhecidaId: true },
  })
  const slugsUsados = new Set(tenantsExistentes.map((t) => t.slug))

  /** @param {string} nome @param {string|null} afiliacaoId */
  function chaveTenant(nome, afiliacaoId) {
    return `${normalizeNome(nome)}|${afiliacaoId ?? ''}`
  }

  /** @type {Map<string, { id: string, slug: string, torcidaConhecidaId: string|null }>} */
  const tenantPorSlug = new Map(tenantsExistentes.map((t) => [t.slug, t]))

  /** @type {Map<string, { id: string, slug: string }>} torcidaConhecidaId → tenant */
  const tenantPorConhecida = new Map()
  /** @type {Map<string, { id: string, slug: string }>} nome+afiliacao → tenant (dedup seed antigo) */
  const tenantPorNomeAfiliacao = new Map()
  for (const t of tenantsExistentes) {
    if (t.torcidaConhecidaId) tenantPorConhecida.set(t.torcidaConhecidaId, { id: t.id, slug: t.slug })
    if (t.afiliacaoId) tenantPorNomeAfiliacao.set(chaveTenant(t.nome, t.afiliacaoId), { id: t.id, slug: t.slug })
  }

  let criados = 0
  let jaLinkados = 0
  let vinculadosExistentes = 0
  let sedes = 0

  for (const tc of conhecidas) {
    const nome = tc.titulo ?? tc.nome
    const jaLinkado = tenantPorConhecida.get(tc.id)
    const existentePorNome = !jaLinkado
      ? resolverTenantExistente(tc, tenantsExistentes, tenantPorNomeAfiliacao, tenantPorSlug, idsEquivalentes)
      : undefined
    const slug = jaLinkado
      ? jaLinkado.slug
      : existentePorNome
        ? existentePorNome.slug
        : slugUnicoParaTenant(tc.slug, slugsUsados)

    if (DRY_RUN) {
      const tag = jaLinkado ? 'linkado' : existentePorNome ? 'existente' : 'novo'
      console.log(`  · [${tag}] ${slug} → ${nome}`)
      if (jaLinkado) jaLinkados += 1
      else if (existentePorNome) vinculadosExistentes += 1
      else criados += 1
      continue
    }

    const tenant = await db.tenant.upsert({
      where: { slug },
      create: {
        slug,
        nome,
        corPrimaria: '#7c3aed',
        afiliacaoId: tc.afiliacaoId,
        logoUrl: tc.logoUrl ?? null,
        torcidaConhecidaId: tc.id,
        ativo: true,
      },
      // NÃO sobrescreve nome/corPrimaria — a liderança pode ter personalizado.
      update: {
        torcidaConhecidaId: tc.id,
        logoUrl: tc.logoUrl ?? null,
        afiliacaoId: tc.afiliacaoId,
      },
    })

    if (jaLinkado) jaLinkados += 1
    else if (existentePorNome) vinculadosExistentes += 1
    else criados += 1

    tenantPorConhecida.set(tc.id, { id: tenant.id, slug: tenant.slug })
    tenantPorSlug.set(tenant.slug, { id: tenant.id, slug: tenant.slug, torcidaConhecidaId: tc.id })
    if (tc.afiliacaoId) {
      tenantPorNomeAfiliacao.set(chaveTenant(nome, tc.afiliacaoId), { id: tenant.id, slug: tenant.slug })
      tenantPorNomeAfiliacao.set(chaveTenant(tc.nome, tc.afiliacaoId), { id: tenant.id, slug: tenant.slug })
    }

    await ensureSystemRoles(tenant.id)

    const sedeId = `sede-principal-${slug}`
    await db.sede.upsert({
      where: { id: sedeId },
      create: {
        id: sedeId,
        tenantId: tenant.id,
        nome: `Sede — ${nome}`,
        tipo: 'SEDE',
        endereco: tc.sede ?? null,
        cidade: tc.cidade ?? null,
        estado: tc.uf ?? null,
        ativa: true,
      },
      update: {
        tenantId: tenant.id,
        ativa: true,
      },
    })
    sedes += 1
  }

  console.log('\nResumo:')
  console.log(`  tenants criados        : ${criados}`)
  console.log(`  tenants já linkados    : ${jaLinkados}`)
  console.log(`  tenants existentes     : ${vinculadosExistentes} (vinculados ao catálogo)`)
  console.log(`  sedes upsertadas       : ${sedes}`)
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
