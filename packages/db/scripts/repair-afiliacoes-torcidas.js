/**
 * Repara vínculos clube ↔ torcida após seeds do catálogo nacional:
 * - Agrupa Afiliacao duplicadas (mesmo clube/UF) e aponta tudo para a canônica
 * - Propaga escudoUrl dentro do grupo
 * - Corrige logoUrl dos tenants a partir de TorcidaConhecida
 * - Remove tenants duplicados vazios (mesmo torcidaConhecidaId, 0 membros)
 *
 *   pnpm --filter @torcida/db db:repair-afiliacoes-torcidas
 *   pnpm --filter @torcida/db db:repair-afiliacoes-torcidas -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import {
  saoMesmoClube,
  indiceAfiliacaoCanonica,
} from '../src/data/afiliacoes-normalize.js'

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

/** @typedef {{ id: string, nome: string, estado: string | null, escudoUrl: string | null, apelido: string | null, slug: string | null, _count: { tenants: number } }} AfiliacaoRow */

/**
 * @param {AfiliacaoRow[]} todas
 * @returns {AfiliacaoRow[][]}
 */
function agruparAfiliacoes(todas) {
  /** @type {AfiliacaoRow[][]} */
  const grupos = []
  const usados = new Set()

  for (const a of todas) {
    if (usados.has(a.id)) continue
    const grupo = todas.filter((b) => !usados.has(b.id) && saoMesmoClube(a, b))
    for (const g of grupo) usados.add(g.id)
    if (grupo.length > 0) grupos.push(grupo)
  }
  return grupos
}

async function repararAfiliacoes() {
  /** @type {AfiliacaoRow[]} */
  const todas = await db.afiliacao.findMany({
    select: {
      id: true,
      nome: true,
      estado: true,
      escudoUrl: true,
      apelido: true,
      slug: true,
      _count: { select: { tenants: true } },
    },
  })

  const grupos = agruparAfiliacoes(todas)
  let merges = 0
  let escudos = 0
  let perfis = 0
  let catalogo = 0

  for (const grupo of grupos) {
    if (grupo.length <= 1) continue
    const canonIdx = indiceAfiliacaoCanonica(grupo)
    const canon = grupo[canonIdx]
    const duplicatas = grupo.filter((_, i) => i !== canonIdx)

    const escudoCanon =
      canon.escudoUrl ?? duplicatas.find((d) => d.escudoUrl)?.escudoUrl ?? null
    const apelidoCanon = canon.apelido ?? duplicatas.find((d) => d.apelido)?.apelido ?? null
    const nomeCanon =
      canon.apelido || canon.nome.length <= 30
        ? canon.nome
        : (duplicatas.find((d) => d.apelido)?.nome ?? canon.nome)

    if (!DRY_RUN && (escudoCanon !== canon.escudoUrl || apelidoCanon !== canon.apelido || nomeCanon !== canon.nome)) {
      await db.afiliacao.update({
        where: { id: canon.id },
        data: {
          ...(escudoCanon && !canon.escudoUrl ? { escudoUrl: escudoCanon } : {}),
          ...(apelidoCanon && !canon.apelido ? { apelido: apelidoCanon } : {}),
          ...(nomeCanon !== canon.nome ? { nome: nomeCanon } : {}),
        },
      })
      if (escudoCanon && !canon.escudoUrl) escudos += 1
    }

    for (const dup of duplicatas) {
      if (DRY_RUN) {
        console.log(`  · afiliacao: ${dup.nome} → ${canon.nome} (${canon.apelido ?? canon.id.slice(0, 8)})`)
        merges += 1
        continue
      }

      const [t, p, tc] = await Promise.all([
        db.tenant.updateMany({ where: { afiliacaoId: dup.id }, data: { afiliacaoId: canon.id } }),
        db.perfilTorcedor.updateMany({ where: { afiliacaoId: dup.id }, data: { afiliacaoId: canon.id } }),
        db.torcidaConhecida.updateMany({ where: { afiliacaoId: dup.id }, data: { afiliacaoId: canon.id } }),
      ])
      merges += 1
      perfis += p.count
      catalogo += tc.count
      if (t.count > 0) console.log(`  · ${dup.nome} → ${canon.nome}: ${t.count} tenant(s)`)

      await db.afiliacao.delete({ where: { id: dup.id } })
    }
  }

  console.log(`Afiliacoes: ${merges} duplicata(s) fundida(s), ${escudos} escudo(s) propagado(s)`)
  if (perfis > 0) console.log(`  perfis torcedor atualizados: ${perfis}`)
  if (catalogo > 0) console.log(`  catálogo atualizado: ${catalogo}`)
}

async function repararLogosTenants() {
  const tenants = await db.tenant.findMany({
    where: { torcidaConhecidaId: { not: null }, ativo: true },
    select: {
      id: true,
      slug: true,
      logoUrl: true,
      torcidaConhecida: { select: { logoUrl: true } },
    },
  })

  let corrigidos = 0
  for (const t of tenants) {
    const logo = t.torcidaConhecida?.logoUrl
    if (!logo || t.logoUrl === logo) continue
    if (DRY_RUN) {
      console.log(`  · logo ${t.slug}`)
      corrigidos += 1
      continue
    }
    await db.tenant.update({ where: { id: t.id }, data: { logoUrl: logo } })
    corrigidos += 1
  }
  console.log(`Logos: ${corrigidos} tenant(s) corrigido(s)`)
}

async function removerTenantsDuplicados() {
  const tenants = await db.tenant.findMany({
    where: { ativo: true, torcidaConhecidaId: { not: null } },
    select: {
      id: true,
      slug: true,
      torcidaConhecidaId: true,
      _count: { select: { membros: true } },
    },
    orderBy: { slug: 'asc' },
  })

  /** @type {Map<string, typeof tenants>} */
  const porCatalogo = new Map()
  for (const t of tenants) {
    if (!t.torcidaConhecidaId) continue
    const lista = porCatalogo.get(t.torcidaConhecidaId) ?? []
    lista.push(t)
    porCatalogo.set(t.torcidaConhecidaId, lista)
  }

  let removidos = 0
  for (const [, lista] of porCatalogo) {
    if (lista.length <= 1) continue
    // Mantém quem tem membros; senão o primeiro slug (âncora costuma ser mais curto).
    const ordenados = [...lista].sort((a, b) => {
      if (b._count.membros !== a._count.membros) return b._count.membros - a._count.membros
      return a.slug.length - b.slug.length
    })
    const manter = ordenados[0]
    for (const dup of ordenados.slice(1)) {
      if (dup._count.membros > 0) continue
      if (DRY_RUN) {
        console.log(`  · tenant dup ${dup.slug} (manter ${manter.slug})`)
        removidos += 1
        continue
      }
      await db.sede.deleteMany({ where: { tenantId: dup.id } })
      await db.role.deleteMany({ where: { tenantId: dup.id } })
      await db.tenant.delete({ where: { id: dup.id } })
      removidos += 1
    }
  }
  console.log(`Tenants: ${removidos} duplicata(s) vazia(s) removida(s)`)
}

async function repararTenantsDesdeCatalogo() {
  const tenants = await db.tenant.findMany({
    where: { torcidaConhecidaId: { not: null }, ativo: true },
    select: {
      id: true,
      slug: true,
      afiliacaoId: true,
      torcidaConhecida: { select: { afiliacaoId: true } },
    },
  })
  let atualizados = 0
  for (const t of tenants) {
    const afId = t.torcidaConhecida?.afiliacaoId
    if (!afId || t.afiliacaoId === afId) continue
    if (DRY_RUN) {
      console.log(`  · tenant ${t.slug} afiliacao ← catálogo`)
      atualizados += 1
      continue
    }
    await db.tenant.update({ where: { id: t.id }, data: { afiliacaoId: afId } })
    atualizados += 1
  }
  console.log(`Tenants: ${atualizados} afiliacaoId(s) sincronizado(s) com o catálogo`)
}

async function main() {
  console.log('Reparo clube ↔ torcida' + (DRY_RUN ? ' (dry-run)' : ''))
  await repararTenantsDesdeCatalogo()
  await repararAfiliacoes()
  await repararLogosTenants()
  await removerTenantsDuplicados()
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
