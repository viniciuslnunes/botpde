/**
 * Popula dados de teste no tenant existente para demonstrar os fluxos
 * implementados no PRD "torcida organizada": hierarquia territorial
 * (subsede + PDE), comunicados oficiais com prioridade/fixação, e eventos
 * globais vs. restritos a uma unidade específica.
 *
 * Não mexe em membros/sócios reais — só cria sedes, comunicados e eventos
 * novos, todos com IDs fixos (upsert), então é seguro rodar mais de uma vez.
 *
 * Uso:
 *   node scripts/seed-dados-teste.js [slug-do-tenant]
 *   (default: pde-gavioes-fiel)
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const slug = process.argv[2] ?? 'pde-gavioes-fiel'

async function main() {
  console.log(`🌱 Semeando dados de teste no tenant '${slug}'...\n`)

  const tenant = await db.tenant.findUnique({ where: { slug } })
  if (!tenant) throw new Error(`Tenant '${slug}' não encontrado.`)

  const sedePrincipal = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE' },
  })
  if (!sedePrincipal) throw new Error(`Tenant '${slug}' não tem uma Sede principal cadastrada.`)

  // ── Hierarquia territorial: subsede + PDE dentro do mesmo tenant ─────────
  const subsede = await db.sede.upsert({
    where: { id: 'subsede-teste-zona-sul' },
    update: {},
    create: {
      id: 'subsede-teste-zona-sul',
      tenantId: tenant.id,
      sedeId: sedePrincipal.id,
      nome: 'Subsede Zona Sul (teste)',
      tipo: 'SUBSEDE',
      cidade: 'São Paulo',
      estado: 'SP',
      responsavel: 'Coordenador de teste',
      ativa: true,
    },
  })
  console.log(`✅ Subsede: ${subsede.nome}`)

  const pde = await db.sede.upsert({
    where: { id: 'pde-teste-vila-nova' },
    update: {},
    create: {
      id: 'pde-teste-vila-nova',
      tenantId: tenant.id,
      sedeId: subsede.id,
      nome: 'PDE Vila Nova (teste)',
      tipo: 'PONTO_ENCONTRO',
      cidade: 'São Paulo',
      estado: 'SP',
      endereco: 'Rua de teste, 123',
      ativa: true,
    },
  })
  console.log(`✅ Ponto de encontro: ${pde.nome}`)

  // ── Autor dos comunicados/eventos: o owner do tenant ─────────────────────
  const ownerRole = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  if (!ownerRole) throw new Error(`Tenant '${slug}' não tem um usuário com cargo 'owner'.`)
  const autorId = ownerRole.userId

  // ── Comunicados oficiais (Announcement) — prioridade e fixação ──────────
  const comunicados = [
    {
      id: 'comunicado-teste-normal',
      titulo: '[TESTE] Nova parceria com o bar da esquina',
      corpo: 'Associados têm 10% de desconto mediante apresentação da carteirinha digital.',
      prioridade: 'NORMAL',
      fixado: false,
    },
    {
      id: 'comunicado-teste-importante',
      titulo: '[TESTE] Alteração no ponto de encontro do próximo jogo',
      corpo: 'O encontro pré-jogo passa a ser no PDE Vila Nova, e não mais na sede principal.',
      prioridade: 'IMPORTANTE',
      fixado: true,
    },
    {
      id: 'comunicado-teste-urgente',
      titulo: '[TESTE] Confirme sua presença na caravana até amanhã',
      corpo: 'Vagas limitadas — quem não confirmar até amanhã perde a vaga no ônibus.',
      prioridade: 'URGENTE',
      fixado: true,
    },
  ]

  for (const c of comunicados) {
    await db.announcement.upsert({
      where: { id: c.id },
      update: { titulo: c.titulo, corpo: c.corpo, prioridade: c.prioridade, fixado: c.fixado },
      create: { ...c, tenantId: tenant.id, autorId },
    })
    console.log(`✅ Comunicado (${c.prioridade}): ${c.titulo}`)
  }

  // ── Eventos: um global, um restrito ao PDE de teste ──────────────────────
  const emDuasSemanas = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const emTresSemanas = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)

  const eventoGlobal = await db.evento.upsert({
    where: { id: 'evento-teste-global' },
    update: {},
    create: {
      id: 'evento-teste-global',
      tenantId: tenant.id,
      titulo: '[TESTE] Jogo em casa — evento aberto a toda a torcida',
      descricao: 'Evento global: sedeId nulo, visível para toda a torcida (e cascateia pras subsedes/PDEs).',
      data: emDuasSemanas,
      local: 'Estádio principal',
      criadoPorId: autorId,
    },
  })
  console.log(`✅ Evento global: ${eventoGlobal.titulo}`)

  const eventoRestrito = await db.evento.upsert({
    where: { id: 'evento-teste-restrito' },
    update: {},
    create: {
      id: 'evento-teste-restrito',
      tenantId: tenant.id,
      titulo: '[TESTE] Reunião interna do PDE Vila Nova',
      descricao: 'Evento restrito: sedeId aponta pro PDE de teste, só quem tem vínculo com essa unidade vê.',
      data: emTresSemanas,
      local: 'PDE Vila Nova',
      sedeId: pde.id,
      criadoPorId: autorId,
    },
  })
  console.log(`✅ Evento restrito: ${eventoRestrito.titulo}`)

  console.log('\n🎉 Dados de teste prontos!')
  console.log(`\n📋 O que testar agora:`)
  console.log(`   - /portal/comunidade e a Home devem mostrar os 3 comunicados, urgente/importante fixados no topo`)
  console.log(`   - /portal/sedes deve listar a Subsede Zona Sul e o PDE Vila Nova além da sede principal`)
  console.log(`   - /portal/eventos deve mostrar "Jogo em casa" (global) pra qualquer associado`)
  console.log(`   - "Reunião interna do PDE Vila Nova" só aparece pra quem tiver SaasMembro.sedeId = '${pde.id}'`)
  console.log(`     (associados atuais provavelmente não têm — é esperado não verem esse evento restrito)`)
}

main()
  .catch((err) => {
    console.error('❌ Erro ao semear dados de teste:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
