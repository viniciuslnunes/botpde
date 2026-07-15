/**
 * Promove a "Subsede Zona Sul (teste)" (criada por seed-dados-teste.js) de
 * simples linha de Sede dentro do tenant principal para um Tenant de
 * verdade — com login próprio (mesmo subdomínio-só-de-teste via lvh.me),
 * pra demonstrar hierarquia sede → subsede com tenants realmente
 * separados, não só Sede rows dentro do mesmo tenant.
 *
 * Mantém `sedeId` apontando pra sede-mãe (preserva a hierarquia), só troca
 * o `tenantId` da Sede pro novo Tenant. Copia os 3 cargos de sistema e dá
 * o cargo 'owner' no novo tenant pro mesmo usuário que já é owner do
 * tenant principal — evita precisar de uma segunda conta Discord/Google
 * pra testar.
 *
 * Idempotente: se a Sede já pertence ao novo tenant, só garante que o
 * usuário tem o cargo 'owner' lá e sai.
 *
 * Uso:
 *   node scripts/promover-subsede-para-tenant.js [slug-do-tenant-principal]
 *   (default: pde-gavioes-fiel)
 */

import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../types/src/permissions.js'
import { upsertDepartamentosCanonicos, upsertPerfisDepartamentoCanonicos } from '../src/departamentos-canonicos.js'

const db = new PrismaClient()
const slugPrincipal = process.argv[2] ?? 'pde-gavioes-fiel'
const NOVO_SLUG = 'subsede-zona-sul-teste'

// Subsede/PDE promovida NÃO tem vice — Vice-presidente existe só no tenant
// da Sede principal (tipo SEDE). Aqui só owner/admin/member.
const SYSTEM_ROLE_DEFAULTS = {
  [SYSTEM_ROLES.OWNER]: { cor: '#2563eb', ordem: 0 },
  [SYSTEM_ROLES.ADMIN]: { cor: '#0891b2', ordem: 1 },
  [SYSTEM_ROLES.MEMBER]: { cor: '#6b7280', ordem: 2 },
}

async function main() {
  console.log(`🌱 Promovendo Subsede Zona Sul (teste) a tenant próprio...\n`)

  const tenantPrincipal = await db.tenant.findUnique({ where: { slug: slugPrincipal } })
  if (!tenantPrincipal) throw new Error(`Tenant '${slugPrincipal}' não encontrado.`)

  const sede = await db.sede.findUnique({ where: { id: 'subsede-teste-zona-sul' } })
  if (!sede) {
    throw new Error(
      `Sede 'subsede-teste-zona-sul' não encontrada — rode seed-dados-teste.js primeiro.`,
    )
  }

  const novoTenant = await db.tenant.upsert({
    where: { slug: NOVO_SLUG },
    update: {},
    create: {
      slug: NOVO_SLUG,
      nome: 'Subsede Zona Sul (teste)',
      plano: 'FREE',
      corPrimaria: '#2563eb', // azul — visualmente diferente da sede principal
    },
  })
  console.log(`✅ Tenant: ${novoTenant.nome} (${novoTenant.slug})`)

  if (sede.tenantId !== novoTenant.id) {
    await db.sede.update({ where: { id: sede.id }, data: { tenantId: novoTenant.id } })
    console.log(`✅ Sede '${sede.nome}' agora pertence ao novo tenant (sedeId continua na sede-mãe)`)
  } else {
    console.log(`ℹ️  Sede já pertence ao novo tenant.`)
  }

  for (const nomeRole of Object.keys(SYSTEM_ROLE_DEFAULTS)) {
    await db.role.upsert({
      where: { tenantId_nome: { tenantId: novoTenant.id, nome: nomeRole } },
      update: {},
      create: {
        tenantId: novoTenant.id,
        nome: nomeRole,
        isSystem: true,
        permissions: SYSTEM_ROLE_PERMISSIONS[nomeRole],
        ...SYSTEM_ROLE_DEFAULTS[nomeRole],
      },
    })
  }
  console.log(`✅ Cargos de sistema criados`)

  const deptos = await upsertDepartamentosCanonicos(db, novoTenant.id)
  const perfis = await upsertPerfisDepartamentoCanonicos(db, novoTenant.id, { incluirVice: false })
  console.log(`✅ Departamentos canônicos: ${deptos.upserted} · perfis área: ${perfis.perfisArea}`)

  const ownerPrincipal = await db.userRole.findFirst({
    where: { tenantId: tenantPrincipal.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  if (!ownerPrincipal) {
    throw new Error(`Tenant '${slugPrincipal}' não tem um usuário com cargo 'owner'.`)
  }

  const ownerRoleNovoTenant = await db.role.findUnique({
    where: { tenantId_nome: { tenantId: novoTenant.id, nome: 'owner' } },
  })

  await db.userRole.upsert({
    where: {
      userId_tenantId_roleId: {
        userId: ownerPrincipal.userId,
        tenantId: novoTenant.id,
        roleId: ownerRoleNovoTenant.id,
      },
    },
    update: {},
    create: {
      userId: ownerPrincipal.userId,
      tenantId: novoTenant.id,
      roleId: ownerRoleNovoTenant.id,
    },
  })
  console.log(`✅ Owner do tenant principal também é owner do novo tenant`)

  console.log('\n🎉 Pronto!')
  console.log(`\n📋 Pra acessar (com ROOT_DOMAIN=lvh.me no .env.local e o dev server rodando):`)
  console.log(`   http://${novoTenant.slug}.lvh.me:3000/portal`)
  console.log(`   (loga primeiro em http://${slugPrincipal}.lvh.me:3000 — o cookie de sessão`)
  console.log(`    é compartilhado entre os subdomínios .lvh.me)`)
}

main()
  .catch((err) => {
    console.error('❌ Erro ao promover subsede a tenant:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
