/**
 * Backfill: garante canal oficial privado para toda SUBSEDE / PONTO_ENCONTRO
 * ativa ainda sem `Sede.canalConversaId` (Caso A e unidades sem admin local).
 *
 * Regra de produto: o canal nasce fechado (`publica: false`), oficial, e
 * **sem** `MembroConversa` ADMIN — o admin do sistema atribui propriedade
 * depois; `criadoPorId` só satisfaz a FK (owner → admin → sócio → 1º user).
 *
 * Idempotente. Uso:
 *   node scripts/ensure-canais-oficiais-unidades.js
 *   node scripts/ensure-canais-oficiais-unidades.js --dry-run
 */
import { prepareSeedEnv } from './lib/seed-env.js'
import { db } from '../src/index.js'

prepareSeedEnv({ scriptLabel: 'ensure-canais-oficiais-unidades' })

const dryRun = process.argv.includes('--dry-run')

async function resolverCriadoPorId(tenantId) {
  const owner = await db.userRole.findFirst({
    where: { tenantId, role: { nome: 'owner', isSystem: true } },
    select: { userId: true },
  })
  if (owner) return owner.userId

  const admin = await db.userRole.findFirst({
    where: { tenantId, role: { nome: 'admin', isSystem: true } },
    select: { userId: true },
  })
  if (admin) return admin.userId

  const membro = await db.saasMembro.findFirst({
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (membro) return membro.userId

  const anyUser = await db.user.findFirst({ select: { id: true }, orderBy: { criadoEm: 'asc' } })
  return anyUser?.id ?? null
}

const sedes = await db.sede.findMany({
  where: {
    ativa: true,
    canalConversaId: null,
    tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
    tenantId: { not: null },
  },
  select: { id: true, nome: true, tipo: true, tenantId: true },
  orderBy: { criadoEm: 'asc' },
})

console.log(
  `${dryRun ? '[dry-run] ' : ''}${sedes.length} unidade(s) SUBSEDE/PDE sem canal oficial.\n`,
)

let criados = 0
let pulados = 0

for (const sede of sedes) {
  const criadoPorId = await resolverCriadoPorId(sede.tenantId)
  if (!criadoPorId) {
    console.log(`⏭  ${sede.tipo} "${sede.nome}" (${sede.id}) — sem user para criadoPorId`)
    pulados++
    continue
  }

  if (dryRun) {
    console.log(`·  criaria canal para ${sede.tipo} "${sede.nome}" (${sede.id})`)
    criados++
    continue
  }

  const canal = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: sede.tenantId,
      nome: sede.nome,
      descricao: 'Canal oficial da unidade',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'ALIADOS',
      somenteAdminPublica: false,
      publica: false,
      criadoPorId,
    },
    select: { id: true },
  })

  const linked = await db.sede.updateMany({
    where: { id: sede.id, canalConversaId: null },
    data: { canalConversaId: canal.id },
  })
  if (linked.count === 0) {
    await db.conversa.delete({ where: { id: canal.id } }).catch(() => undefined)
    console.log(`⚠  corrida em "${sede.nome}" — já tinha canal; órfão descartado`)
    pulados++
    continue
  }

  console.log(`✅ ${sede.tipo} "${sede.nome}" → canal ${canal.id}`)
  criados++
}

console.log(
  `\n${dryRun ? 'Simulados' : 'Criados'}: ${criados} · pulados: ${pulados} · total sem canal na varredura: ${sedes.length}`,
)
await db.$disconnect()
process.exit(0)
