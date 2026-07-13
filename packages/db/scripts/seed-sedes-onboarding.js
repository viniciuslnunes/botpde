/**
 * Seed de subsedes e PDEs curados para o passo Unidade do onboarding.
 *
 *   pnpm --filter @torcida/db seed:sedes-onboarding
 *   pnpm --filter @torcida/db seed:sedes-onboarding -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { SEDES_ONBOARDING_CURADAS } from '../src/data/sedes-onboarding-curadas.js'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'
import { TORCIDAS_CONHECIDAS } from '../src/data/torcidas-conhecidas.js'
import { normalizeNome, saoMesmoClube } from '../src/data/afiliacoes-normalize.js'

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function resolverSedeNacional(tenantId) {
  const sedes = await db.sede.findMany({
    where: { tenantId, ativa: true, tipo: 'SEDE' },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  })
  if (sedes.length > 0) return sedes[0]
  const qualquer = await db.sede.findFirst({
    where: { tenantId, ativa: true },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  })
  return qualquer
}

async function resolverTenant(bloco) {
  const porSlug = await db.tenant.findFirst({
    where: { slug: { in: bloco.tenantSlugs }, ativo: true },
    select: { id: true, slug: true, nome: true },
  })
  if (porSlug) return porSlug

  for (const fragmento of bloco.tenantNomes ?? []) {
    const porNome = await db.tenant.findFirst({
      where: { nome: { contains: fragmento, mode: 'insensitive' }, ativo: true },
      select: { id: true, slug: true, nome: true },
    })
    if (porNome) return porNome
  }
  return null
}

function acharCatalogoTorcida(curada) {
  const candidatas = TORCIDAS_CONHECIDAS.filter(
    (tc) =>
      tc.clubeNomeOriginal &&
      saoMesmoClube(
        { nome: curada.clube, estado: curada.estado },
        { nome: tc.clubeNomeOriginal, estado: tc.uf },
      ),
  )
  return (
    candidatas.find((tc) =>
      normalizeNome(tc.nome).includes(normalizeNome(curada.nome).split(' ')[0] ?? ''),
    ) ?? candidatas[0] ?? null
  )
}

async function sincronizarSedesNacionaisCatalogo() {
  let atualizadas = 0
  for (const curada of TORCIDAS_BRASIL) {
    const tenant = await db.tenant.findFirst({
      where: { slug: curada.slug, ativo: true },
      select: { id: true, slug: true },
    })
    if (!tenant) continue

    const catalogo = acharCatalogoTorcida(curada)
    if (!catalogo?.sede) continue

    const sedeId = `sede-principal-${tenant.slug}`
    if (DRY_RUN) {
      console.log(`  · [SEDE catálogo] ${tenant.slug} ← ${catalogo.sede.slice(0, 50)}…`)
      atualizadas += 1
      continue
    }

    await db.sede.upsert({
      where: { id: sedeId },
      create: {
        id: sedeId,
        tenantId: tenant.id,
        nome: `Sede — ${curada.nome}`,
        tipo: 'SEDE',
        endereco: catalogo.sede,
        cidade: catalogo.cidade ?? curada.cidade ?? null,
        estado: catalogo.uf ?? curada.estado,
        ativa: true,
      },
      update: {
        endereco: catalogo.sede,
        cidade: catalogo.cidade ?? curada.cidade ?? null,
        estado: catalogo.uf ?? curada.estado,
        ativa: true,
      },
    })
    atualizadas += 1
  }
  return atualizadas
}

async function main() {
  let upserts = 0
  let tenantsOk = 0
  let tenantsSkip = 0

  for (const bloco of SEDES_ONBOARDING_CURADAS) {
    const tenant = await resolverTenant(bloco)
    if (!tenant) {
      const rotulo = [...bloco.tenantSlugs, ...(bloco.tenantNomes ?? [])].join(' | ')
      console.log(`⊘ Tenant não encontrado: ${rotulo}`)
      tenantsSkip += 1
      continue
    }

    const sedeNacional = await resolverSedeNacional(tenant.id)
    if (!sedeNacional) {
      console.log(`⊘ Sem sede nacional: ${tenant.slug}`)
      tenantsSkip += 1
      continue
    }

    tenantsOk += 1
    const paiPorId = new Map([[sedeNacional.id, sedeNacional.id]])

    for (const u of bloco.unidades) {
      const parentSedeId = u.parentId
        ? (paiPorId.get(u.parentId) ?? sedeNacional.id)
        : sedeNacional.id

      if (DRY_RUN) {
        console.log(`  · [${u.tipo}] ${u.nome} → ${tenant.slug}`)
        upserts += 1
        paiPorId.set(u.id, u.id)
        continue
      }

      await db.sede.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          tenantId: tenant.id,
          nome: u.nome,
          tipo: u.tipo,
          cidade: u.cidade ?? null,
          estado: u.estado ?? null,
          endereco: u.endereco ?? null,
          sedeId: parentSedeId,
          ativa: true,
        },
        update: {
          tenantId: tenant.id,
          nome: u.nome,
          tipo: u.tipo,
          cidade: u.cidade ?? null,
          estado: u.estado ?? null,
          endereco: u.endereco ?? null,
          sedeId: parentSedeId,
          ativa: true,
        },
      })
      paiPorId.set(u.id, u.id)
      upserts += 1
      console.log(`  ✓ ${tenant.slug} — ${u.tipo} ${u.nome}`)
    }
  }

  const nacionais = await sincronizarSedesNacionaisCatalogo()

  console.log(
    `\nSedes onboarding — ${upserts} unidade(s) curada(s), ${nacionais} sede(s) nacional(is) do catálogo, ${tenantsOk} tenant(s)${tenantsSkip ? `, ${tenantsSkip} omitido(s)` : ''}${DRY_RUN ? ' (dry-run)' : ''}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
