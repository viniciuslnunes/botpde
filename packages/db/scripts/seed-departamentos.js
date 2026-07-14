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
 *
 * Política membro vs gestor:
 *   permissions        → o que o membro da equipe ganha (ver / agir leve)
 *   permissionsGestor  → o que o gestor ganha a mais (gerir a área)
 */
import { PrismaClient } from '@prisma/client'
import {
  PERMISSIONS,
  applyPermissionCascade,
  slugifyDepartamento,
} from '../../types/src/permissions.js'

const db = new PrismaClient()

/** Slugs legados que não são departamentos (São tipos de membro). */
const SLUGS_LEGADOS = ['socio', 'torcedor']

/**
 * Lista canônica — Diretoria e Patrimônio ficam sem permissões de propósito:
 * a visão ampla da Diretoria vem do perfil (Presidente/Vice), não do
 * departamento; Patrimônio é stub até o módulo existir.
 */
const DEPARTAMENTOS_CANONICOS = [
  {
    nome: 'Diretoria',
    cor: '#1f2937',
    moduloPortal: null,
    permissions: [],
    permissionsGestor: [],
  },
  {
    nome: 'Financeiro',
    cor: '#047857',
    moduloPortal: 'financeiro',
    permissions: [PERMISSIONS.REPORTS_VIEW],
    permissionsGestor: [],
  },
  {
    nome: 'Social e eventos',
    cor: '#7c3aed',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Materiais / Loja',
    cor: '#b45309',
    moduloPortal: 'loja',
    permissions: [PERMISSIONS.STORE_VIEW_ORDERS],
    permissionsGestor: [PERMISSIONS.STORE_MANAGE],
  },
  {
    nome: 'Comunicação',
    cor: '#0369a1',
    moduloPortal: 'comunidade',
    permissions: [PERMISSIONS.COMMUNITY_POST, PERMISSIONS.ANNOUNCEMENTS_PUBLISH],
    permissionsGestor: [PERMISSIONS.COMMUNITY_MANAGE, PERMISSIONS.NEWS_CURATE],
  },
  {
    nome: 'Patrimônio',
    cor: '#57534e',
    moduloPortal: 'patrimonio',
    permissions: [],
    permissionsGestor: [],
  },
  {
    nome: 'Batucada',
    cor: '#be123c',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Caravanas',
    cor: '#c2410c',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Feminino',
    cor: '#db2777',
    moduloPortal: 'comunidade',
    permissions: [PERMISSIONS.COMMUNITY_POST],
    permissionsGestor: [],
  },
  {
    nome: 'Carnaval',
    cor: '#4d7c0f',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
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

  // Blindagem: remove Sócio/Torcedor se reaparecerem como "departamento".
  const removidos = await db.departamento.deleteMany({
    where: { tenantId: tenant.id, slug: { in: SLUGS_LEGADOS } },
  })
  if (verbose && removidos.count > 0) {
    console.log(`  · removidos ${removidos.count} legado(s) socio/torcedor`)
  }

  let ordem = 0
  for (const canonico of DEPARTAMENTOS_CANONICOS) {
    const slug = slugifyDepartamento(canonico.nome)
    const permissions = applyPermissionCascade([], canonico.permissions)
    const permissionsGestor = applyPermissionCascade(
      permissions,
      [...permissions, ...canonico.permissionsGestor],
    ).filter((p) => !permissions.includes(p))

    await db.departamento.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      create: {
        tenantId: tenant.id,
        nome: canonico.nome,
        slug,
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        permissionsGestor,
        ordem,
      },
      update: {
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        permissionsGestor,
        ordem,
      },
    })

    if (verbose) {
      const resumoMembro =
        permissions.length === 0 ? 'sem perms membro' : `membro: ${permissions.join(', ')}`
      const resumoGestor =
        permissionsGestor.length === 0
          ? 'sem perms gestor'
          : `gestor+: ${permissionsGestor.join(', ')}`
      console.log(
        `  ✓ ${canonico.nome} [${slug}] → ${canonico.moduloPortal ?? 'sem módulo'} (${resumoMembro}; ${resumoGestor})`,
      )
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
