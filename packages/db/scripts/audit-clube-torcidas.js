/**
 * Auditoria de integridade: Afiliacao (clube) ↔ TorcidaConhecida ↔ Tenant.
 *
 *   pnpm --filter @torcida/db audit:clube-torcidas
 *   pnpm --filter @torcida/db audit:clube-torcidas -- --json
 *
 * REQUER DATABASE_URL — não roda no CI.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import {
  saoMesmoClube,
  indiceAfiliacaoCanonica,
  chaveMatch,
  normalizeNome,
} from '../src/data/afiliacoes-normalize.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const JSON_OUT = process.argv.includes('--json')
const db = new PrismaClient()

/** @typedef {{ id: string, nome: string, estado: string | null, apelido: string | null, slug: string | null, escudoUrl: string | null, _count: { tenants: number, torcidasConhecidas: number } }} AfRow */

/**
 * @param {AfRow[]} todas
 * @returns {AfRow[][]}
 */
function agruparPorMesmoClube(todas) {
  /** @type {AfRow[][]} */
  const grupos = []
  const usados = new Set()
  for (const a of todas) {
    if (usados.has(a.id)) continue
    const grupo = todas.filter((b) => !usados.has(b.id) && saoMesmoClube(a, b))
    for (const g of grupo) usados.add(g.id)
    grupos.push(grupo)
  }
  return grupos
}

/**
 * @param {AfRow[]} grupo
 * @returns {AfRow}
 */
function canonicoDe(grupo) {
  return grupo[indiceAfiliacaoCanonica(grupo)]
}

async function main() {
  /** @type {AfRow[]} */
  const afiliacoes = await db.afiliacao.findMany({
    select: {
      id: true,
      nome: true,
      estado: true,
      apelido: true,
      slug: true,
      escudoUrl: true,
      _count: { select: { tenants: true, torcidasConhecidas: true } },
    },
    orderBy: { nome: 'asc' },
  })

  const gruposDup = agruparPorMesmoClube(afiliacoes).filter((g) => g.length > 1)

  /** @type {Array<{ grupo: string[], canonico: string, problema: string }>} */
  const duplicatasAfiliacao = gruposDup.map((grupo) => {
    const canon = canonicoDe(grupo)
    return {
      grupo: grupo.map((a) => `${a.nome} (${a.estado ?? '?'}) [${a._count.tenants}t/${a._count.torcidasConhecidas}c]`),
      canonico: `${canon.nome} (${canon.estado ?? '?'}) id=${canon.id.slice(0, 8)}`,
      problema: 'Mesmo clube com múltiplas Afiliacao — rodar db:repair-afiliacoes-torcidas',
    }
  })

  const semEstado = afiliacoes.filter((a) => !a.estado).map((a) => `${a.nome} id=${a.id.slice(0, 8)}`)

  const torcidasCatalogo = await db.torcidaConhecida.findMany({
    select: {
      id: true,
      titulo: true,
      nome: true,
      slug: true,
      uf: true,
      clubeNomeOriginal: true,
      afiliacaoId: true,
      afiliacao: { select: { nome: true, estado: true } },
      tenant: { select: { id: true, slug: true, afiliacaoId: true, ativo: true } },
    },
    orderBy: { titulo: 'asc' },
  })

  /** @type {string[]} */
  const catalogoSemClube = []
  /** @type {string[]} */
  const catalogoClubeSuspeito = []
  /** @type {string[]} */
  const tenantAfiliacaoDivergente = []

  for (const tc of torcidasCatalogo) {
    if (!tc.afiliacaoId) {
      catalogoSemClube.push(`${tc.titulo ?? tc.nome} (${tc.uf ?? '?'}) slug=${tc.slug}`)
      continue
    }
    if (tc.afiliacao && tc.clubeNomeOriginal) {
      const ref = { nome: tc.clubeNomeOriginal, estado: tc.uf }
      const alvo = { nome: tc.afiliacao.nome, estado: tc.afiliacao.estado }
      if (!saoMesmoClube(ref, alvo)) {
        catalogoClubeSuspeito.push(
          `${tc.titulo ?? tc.slug}: clubeOriginal="${tc.clubeNomeOriginal}" → afiliacao="${tc.afiliacao.nome}" (${tc.afiliacao.estado ?? '?'})`,
        )
      }
    }
    if (tc.tenant && tc.tenant.afiliacaoId && tc.tenant.afiliacaoId !== tc.afiliacaoId) {
      tenantAfiliacaoDivergente.push(
        `tenant ${tc.tenant.slug}: afiliacaoId ${tc.tenant.afiliacaoId.slice(0, 8)} ≠ catálogo ${tc.afiliacaoId.slice(0, 8)}`,
      )
    }
  }

  const tenants = await db.tenant.findMany({
    where: { ativo: true },
    select: {
      id: true,
      slug: true,
      nome: true,
      afiliacaoId: true,
      torcidaConhecidaId: true,
      afiliacao: { select: { nome: true, estado: true } },
      torcidaConhecida: {
        select: {
          titulo: true,
          afiliacaoId: true,
          clubeNomeOriginal: true,
          uf: true,
        },
      },
      _count: { select: { membros: true } },
    },
    orderBy: { slug: 'asc' },
  })

  /** @type {string[]} */
  const tenantsSemClube = []
  /** @type {string[]} */
  const tenantsDuplicadosCatalogo = []

  for (const t of tenants) {
    if (!t.afiliacaoId) tenantsSemClube.push(`${t.slug} (${t.nome})`)
  }

  /** @type {Map<string, typeof tenants>} */
  const porCatalogo = new Map()
  for (const t of tenants) {
    if (!t.torcidaConhecidaId) continue
    const lista = porCatalogo.get(t.torcidaConhecidaId) ?? []
    lista.push(t)
    porCatalogo.set(t.torcidaConhecidaId, lista)
  }
  for (const [tcId, lista] of porCatalogo) {
    if (lista.length <= 1) continue
    tenantsDuplicadosCatalogo.push(
      `torcidaConhecidaId=${tcId.slice(0, 8)}: ${lista.map((t) => `${t.slug}(${t._count.membros}m)`).join(', ')}`,
    )
  }

  /** Cruzamento: tenants do mesmo clube canônico vs grupos chaveMatch */
  /** @type {Map<string, Set<string>>} */
  const tenantsPorChaveMatch = new Map()
  /** @type {Map<string, Set<string>>} */
  const tenantsPorSaoMesmo = new Map()

  for (const t of tenants) {
    if (!t.afiliacao) continue
    const chaveCm = `${chaveMatch(t.afiliacao.nome)}|${normalizeNome(t.afiliacao.estado ?? '')}`
    const setCm = tenantsPorChaveMatch.get(chaveCm) ?? new Set()
    setCm.add(t.slug)
    tenantsPorChaveMatch.set(chaveCm, setCm)

    const grupo = agruparPorMesmoClube(afiliacoes).find((g) => g.some((a) => a.id === t.afiliacaoId))
    if (!grupo) continue
    const canon = canonicoDe(grupo)
    const chaveSm = `${canon.id}`
    const setSm = tenantsPorSaoMesmo.get(chaveSm) ?? new Set()
    setSm.add(t.slug)
    tenantsPorSaoMesmo.set(chaveSm, setSm)
  }

  /** @type {string[]} */
  const divergenciaAgrupamento = []
  for (const grupo of gruposDup) {
    const slugs = tenants
      .filter((t) => grupo.some((a) => a.id === t.afiliacaoId))
      .map((t) => t.slug)
    if (slugs.length > 0 && grupo.length > 1) {
      divergenciaAgrupamento.push(
        `${grupo.map((a) => a.nome).join(' × ')} → tenants: ${slugs.join(', ')}`,
      )
    }
  }

  /** Por clube canônico: quantas torcidas ativas */
  const porClubeCanonico = new Map()
  for (const t of tenants) {
    if (!t.afiliacaoId) continue
    const grupo = agruparPorMesmoClube(afiliacoes).find((g) => g.some((a) => a.id === t.afiliacaoId))
    const canonId = grupo ? canonicoDe(grupo).id : t.afiliacaoId
    const entry = porClubeCanonico.get(canonId) ?? {
      nome: grupo ? canonicoDe(grupo).nome : t.afiliacao?.nome,
      uf: grupo ? canonicoDe(grupo).estado : t.afiliacao?.estado,
      tenants: [],
    }
    entry.tenants.push(t.slug)
    porClubeCanonico.set(canonId, entry)
  }

  const clubesComTorcida = [...porClubeCanonico.values()].filter((c) => c.tenants.length > 0)
  const clubesSemTorcida = afiliacoes.filter((a) => {
    const grupo = agruparPorMesmoClube(afiliacoes).find((g) => g.some((x) => x.id === a.id))
    const canon = grupo ? canonicoDe(grupo) : a
    return canon.id === a.id && a._count.tenants === 0 && a._count.torcidasConhecidas > 0
  })

  const perfis = await db.perfilTorcedor.findMany({
    where: { afiliacaoId: { not: null } },
    select: { afiliacaoId: true },
  })
  const perfisEmDuplicata = perfis.filter((p) => {
    const af = afiliacoes.find((a) => a.id === p.afiliacaoId)
    if (!af) return false
    const grupo = agruparPorMesmoClube(afiliacoes).find((g) => g.some((a) => a.id === af.id))
    if (!grupo || grupo.length <= 1) return false
    return canonicoDe(grupo).id !== af.id
  })

  /** Órfãos: Afiliacao sem tenant/catálogo com irmã canônica que tem vínculos */
  /** @type {string[]} */
  const orfaosComIrmaAtiva = []
  for (const grupo of gruposDup) {
    const canon = canonicoDe(grupo)
    for (const a of grupo) {
      if (a.id === canon.id) continue
      if (a._count.tenants === 0 && a._count.torcidasConhecidas === 0 && (canon._count.tenants > 0 || canon._count.torcidasConhecidas > 0)) {
        orfaosComIrmaAtiva.push(`${a.nome} (${a.estado}) → canônico ${canon.nome}`)
      }
    }
  }

  const report = {
    geradoEm: new Date().toISOString(),
    totais: {
      afiliacoes: afiliacoes.length,
      torcidasCatalogo: torcidasCatalogo.length,
      tenantsAtivos: tenants.length,
      clubesComTenant: clubesComTorcida.length,
      comEscudo: afiliacoes.filter((a) => a.escudoUrl).length,
      semEscudo: afiliacoes.filter((a) => !a.escudoUrl).length,
    },
    problemas: {
      duplicatasAfiliacao: duplicatasAfiliacao.length,
      semEstado: semEstado.length,
      catalogoSemClube: catalogoSemClube.length,
      catalogoClubeSuspeito: catalogoClubeSuspeito.length,
      tenantAfiliacaoDivergente: tenantAfiliacaoDivergente.length,
      tenantsSemClube: tenantsSemClube.length,
      tenantsDuplicadosCatalogo: tenantsDuplicadosCatalogo.length,
      perfisEmAfiliacaoNaoCanonica: perfisEmDuplicata.length,
      clubesComCatalogoSemTenant: clubesSemTorcida.length,
      orfaosComIrmaAtiva: orfaosComIrmaAtiva.length,
    },
    duplicatasAfiliacao,
    semEstado: semEstado.slice(0, 30),
    catalogoSemClube: catalogoSemClube.slice(0, 40),
    catalogoClubeSuspeito: catalogoClubeSuspeito.slice(0, 40),
    tenantAfiliacaoDivergente,
    tenantsSemClube,
    tenantsDuplicadosCatalogo,
    divergenciaAgrupamento: divergenciaAgrupamento.slice(0, 30),
    clubesComCatalogoSemTenant: clubesSemTorcida
      .slice(0, 30)
      .map((a) => `${a.nome} (${a.estado}) — ${a._count.torcidasConhecidas} no catálogo, 0 tenant`),
    orfaosComIrmaAtiva,
    amostraClubesComTorcida: clubesComTorcida
      .sort((a, b) => b.tenants.length - a.tenants.length)
      .slice(0, 15)
      .map((c) => `${c.nome} (${c.uf}): ${c.tenants.length} torcida(s) — ${c.tenants.slice(0, 5).join(', ')}${c.tenants.length > 5 ? '…' : ''}`),
  }

  const outPath = resolve(__dir, '../src/data/audit-clube-torcidas-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('Auditoria clube ↔ torcida organizada\n')
  console.log('Totais:')
  console.log(`  Afiliacoes          : ${report.totais.afiliacoes}`)
  console.log(`  TorcidaConhecida    : ${report.totais.torcidasCatalogo}`)
  console.log(`  Tenants ativos      : ${report.totais.tenantsAtivos}`)
  console.log(`  Clubes com tenant   : ${report.totais.clubesComTenant}`)
  console.log(`  Escudos             : ${report.totais.comEscudo}/${report.totais.afiliacoes}`)

  console.log('\nProblemas:')
  for (const [k, v] of Object.entries(report.problemas)) {
    const icon = v === 0 ? '✓' : '✗'
    console.log(`  ${icon} ${k}: ${v}`)
  }

  if (duplicatasAfiliacao.length > 0) {
    console.log('\n--- Duplicatas Afiliacao (amostra) ---')
    for (const d of duplicatasAfiliacao.slice(0, 10)) {
      console.log(`  · ${d.grupo.join(' | ')}`)
      console.log(`    canônico: ${d.canonico}`)
    }
  }

  if (catalogoClubeSuspeito.length > 0) {
    console.log('\n--- Catálogo com clube suspeito (amostra) ---')
    for (const s of catalogoClubeSuspeito.slice(0, 10)) console.log(`  · ${s}`)
  }

  if (divergenciaAgrupamento.length > 0) {
    console.log('\n--- Tenants presos em Afiliacao duplicada ---')
    for (const d of divergenciaAgrupamento.slice(0, 10)) console.log(`  · ${d}`)
  }

  console.log(`\nRelatório completo: ${outPath}`)
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
