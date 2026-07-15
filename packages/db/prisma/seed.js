import { PrismaClient } from '@prisma/client'
import { bootstrapAcessoTenant } from '../src/departamentos-canonicos.js'

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

  // ── Departamentos + perfis de área + cargos de sistema ──────────────────
  const boot = await bootstrapAcessoTenant(db, tenant.id, { incluirVice: true })
  console.log(
    `✅ Departamentos: ${boot.upserted} · perfis área: ${boot.perfisArea} · sistema: ${boot.systemUpserted}`,
  )

  // ── Cargos customizados iniciais (transversais) ─────────────────────────
  const customRoles = [
    {
      nome: 'Recrutador',
      cor: '#10b981',
      ordem: 50,
      isSystem: false,
      permissions: ['members:view', 'members:approve', 'members:reject'],
      permissionsExtras: [],
    },
    {
      nome: 'Fiscal de Loja',
      cor: '#8b5cf6',
      ordem: 40,
      isSystem: false,
      permissions: ['store:view_orders', 'store:manage'],
      permissionsExtras: [],
    },
    {
      nome: 'Coordenador de Eventos',
      cor: '#f97316',
      ordem: 45,
      isSystem: false,
      permissions: ['events:create', 'events:manage', 'sedes:manage'],
      permissionsExtras: [],
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
