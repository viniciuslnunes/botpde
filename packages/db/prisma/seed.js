import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../../types/src/permissions.js'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // ── Tenant: PDE dos Gaviões da Fiel ─────────────────────────────────────
  const tenant = await db.tenant.upsert({
    where: { slug: 'pde-gavioes-fiel' },
    update: {},
    create: {
      slug: 'pde-gavioes-fiel',
      nome: 'PDE dos Gaviões da Fiel',
      plano: 'FREE',
      corPrimaria: '#1a1a1a', // preto dos Gaviões
      // Conecta ao guild do Discord existente (preencha com o GUILD_ID real)
      discordGuildId: process.env.DISCORD_GUILD_ID ?? null,
    },
  })

  console.log(`✅ Tenant criado: ${tenant.nome} (${tenant.slug})`)

  // ── Cargos do sistema (não editáveis) ───────────────────────────────────
  const systemRoles = [
    {
      nome: SYSTEM_ROLES.OWNER,
      cor: '#f59e0b',
      ordem: 100,
      isSystem: true,
      permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER],
    },
    {
      nome: SYSTEM_ROLES.ADMIN,
      cor: '#3b82f6',
      ordem: 90,
      isSystem: true,
      permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
    },
    {
      nome: SYSTEM_ROLES.MEMBER,
      cor: '#6b7280',
      ordem: 0,
      isSystem: true,
      permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
    },
  ]

  for (const roleData of systemRoles) {
    const role = await db.role.upsert({
      where: { tenantId_nome: { tenantId: tenant.id, nome: roleData.nome } },
      update: { permissions: roleData.permissions },
      create: { tenantId: tenant.id, ...roleData },
    })
    console.log(`✅ Cargo do sistema: ${role.nome}`)
  }

  // ── Cargos customizados iniciais ────────────────────────────────────────
  const customRoles = [
    {
      nome: 'Recrutador',
      cor: '#10b981',
      ordem: 50,
      isSystem: false,
      permissions: ['members:view', 'members:approve', 'members:reject'],
    },
    {
      nome: 'Fiscal de Loja',
      cor: '#8b5cf6',
      ordem: 40,
      isSystem: false,
      permissions: ['store:view_orders', 'store:manage'],
    },
    {
      nome: 'Coordenador de Eventos',
      cor: '#f97316',
      ordem: 45,
      isSystem: false,
      permissions: ['events:create', 'events:manage', 'sedes:manage'],
    },
  ]

  for (const roleData of customRoles) {
    const role = await db.role.upsert({
      where: { tenantId_nome: { tenantId: tenant.id, nome: roleData.nome } },
      update: {},
      create: { tenantId: tenant.id, ...roleData },
    })
    console.log(`✅ Cargo customizado: ${role.nome}`)
  }

  // ── Sede principal ───────────────────────────────────────────────────────
  const sede = await db.sede.upsert({
    where: { id: 'sede-principal-pde' },
    update: {},
    create: {
      id: 'sede-principal-pde',
      tenantId: tenant.id,
      nome: 'Sede Principal — PDE Gaviões da Fiel',
      tipo: 'SEDE',
      cidade: 'São Paulo',
      estado: 'SP',
      ativa: true,
    },
  })

  console.log(`✅ Sede criada: ${sede.nome}`)

  console.log('\n🎉 Seed concluído com sucesso!')
  console.log(`\n📋 Resumo:`)
  console.log(`   Tenant: ${tenant.nome}`)
  console.log(`   Slug:   ${tenant.slug}`)
  console.log(`   ID:     ${tenant.id}`)
  console.log(`\n⚙️  Configure TENANT_SLUG=${tenant.slug} no .env do apps/web`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
