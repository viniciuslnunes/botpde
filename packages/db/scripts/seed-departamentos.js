/**
 * Seed da lista canônica de departamentos de uma torcida — cada um com slug,
 * cor, módulo de portal e permissões (reaproveitando o vocabulário de
 * packages/types/src/permissions.js).
 *
 *   pnpm --filter @torcida/db seed:departamentos
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db seed:departamentos
 *
 * Sem TENANT_SLUG, semeia todos os tenants ativos. Idempotente: upsert por
 * (tenantId, slug) — atualiza cor/módulo/permissões sem duplicar.
 */
import { PrismaClient } from '@prisma/client'
import {
  PERMISSIONS,
  applyPermissionCascade,
  slugifyDepartamento,
} from '../../types/src/permissions.js'

const db = new PrismaClient()

/**
 * Lista canônica — Diretoria e Patrimônio ficam sem permissões de propósito:
 * a visão ampla da Diretoria vem do perfil (Presidente/Vice), não do
 * departamento; Patrimônio é stub até o módulo existir.
 */
const DEPARTAMENTOS_CANONICOS = [
  { nome: 'Diretoria', cor: '#1f2937', moduloPortal: null, permissions: [] },
  { nome: 'Financeiro', cor: '#047857', moduloPortal: 'financeiro', permissions: [PERMISSIONS.REPORTS_VIEW] },
  { nome: 'Social e eventos', cor: '#7c3aed', moduloPortal: 'eventos', permissions: [PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE] },
  { nome: 'Materiais / Loja', cor: '#b45309', moduloPortal: 'loja', permissions: [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE] },
  { nome: 'Comunicação', cor: '#0369a1', moduloPortal: 'comunidade', permissions: [PERMISSIONS.COMMUNITY_MANAGE, PERMISSIONS.ANNOUNCEMENTS_PUBLISH, PERMISSIONS.NEWS_CURATE] },
  { nome: 'Patrimônio', cor: '#57534e', moduloPortal: 'patrimonio', permissions: [] },
  { nome: 'Batucada', cor: '#be123c', moduloPortal: 'eventos', permissions: [PERMISSIONS.EVENTS_CREATE] },
  { nome: 'Caravanas', cor: '#c2410c', moduloPortal: 'eventos', permissions: [PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE] },
  { nome: 'Feminino', cor: '#db2777', moduloPortal: 'comunidade', permissions: [PERMISSIONS.COMMUNITY_POST] },
  { nome: 'Carnaval', cor: '#4d7c0f', moduloPortal: 'eventos', permissions: [PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE] },
]

async function resolverTenants() {
  const slug = process.env.TENANT_SLUG
  if (slug) {
    const tenant = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, nome: true, slug: true },
    })
    if (!tenant) throw new Error(`Tenant não encontrado para TENANT_SLUG="${slug}"`)
    return [tenant]
  }
  /** @type {Array<{ id: string, nome: string, slug: string }>} */
  const tenants = await db.tenant.findMany({
    where: { ativo: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, slug: true },
  })
  if (tenants.length === 0) throw new Error('Nenhum tenant ativo encontrado — informe TENANT_SLUG')
  return tenants
}

/**
 * @param {{ id: string, nome: string, slug: string }} tenant
 * @param {boolean} verbose
 */
async function seedTenant(tenant, verbose) {
  if (verbose) console.log(`Seed de departamentos para "${tenant.nome}" (${tenant.slug})`)

  let ordem = 0
  for (const canonico of DEPARTAMENTOS_CANONICOS) {
    const slug = slugifyDepartamento(canonico.nome)
    const permissions = applyPermissionCascade([], canonico.permissions)

    await db.departamento.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      create: {
        tenantId: tenant.id,
        nome: canonico.nome,
        slug,
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        ordem,
      },
      update: {
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        ordem,
      },
    })

    if (verbose) {
      const resumoPerms =
        permissions.length === 0 ? 'sem permissões' : permissions.join(', ')
      console.log(`  ✓ ${canonico.nome} [${slug}] → ${canonico.moduloPortal ?? 'sem módulo'} (${resumoPerms})`)
    }
    ordem += 1
  }
}

async function main() {
  const tenants = await resolverTenants()
  const verbose = tenants.length === 1
  console.log(
    verbose
      ? ''
      : `Seed de departamentos canônicos em ${tenants.length} tenant(s) ativos...\n`,
  )

  let i = 0
  for (const tenant of tenants) {
    await seedTenant(tenant, verbose)
    i += 1
    if (!verbose && (i % 50 === 0 || i === tenants.length)) {
      console.log(`  … ${i}/${tenants.length}`)
    }
  }

  console.log(
    `\n${DEPARTAMENTOS_CANONICOS.length} departamentos × ${tenants.length} tenant(s) sincronizados.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
