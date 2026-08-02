/**
 * Backfill: sócio Caso B com espelho na Sede sem cargo `member` não publica
 * no feed "Minha torcida" (community:post resolve no tenant da raiz).
 *
 * Uso:
 *   node scripts/repair-espelho-member-role.js
 *   node scripts/repair-espelho-member-role.js --dry-run
 */
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')

const espelhos = await db.saasMembro.findMany({
  where: { espelhado: true, status: 'APROVADO', desligadoEm: null, tipo: 'SOCIO' },
  select: { userId: true, tenantId: true },
})

/** @type {Map<string, string>} tenantId → roleId member */
const memberRolePorTenant = new Map()
const tenantIds = [...new Set(espelhos.map((e) => e.tenantId))]
const roles = await db.role.findMany({
  where: { tenantId: { in: tenantIds }, nome: 'member', isSystem: true },
  select: { id: true, tenantId: true },
})
for (const r of roles) memberRolePorTenant.set(r.tenantId, r.id)

const existentes = await db.userRole.findMany({
  where: {
    userId: { in: [...new Set(espelhos.map((e) => e.userId))] },
    tenantId: { in: tenantIds },
    roleId: { in: roles.map((r) => r.id) },
  },
  select: { userId: true, tenantId: true, roleId: true },
})
const jaTem = new Set(existentes.map((e) => `${e.userId}:${e.tenantId}`))

const paraCriar = []
let semRole = 0
for (const e of espelhos) {
  const roleId = memberRolePorTenant.get(e.tenantId)
  if (!roleId) {
    semRole++
    continue
  }
  if (jaTem.has(`${e.userId}:${e.tenantId}`)) continue
  paraCriar.push({ userId: e.userId, tenantId: e.tenantId, roleId })
}

console.log(
  `Espelhos SOCIO: ${espelhos.length} · roles a criar: ${paraCriar.length} · tenant sem member: ${semRole}`,
)

if (dryRun) {
  console.log('\n(--dry-run) nenhuma escrita.')
  process.exit(0)
}

let criados = 0
for (const row of paraCriar) {
  await db.userRole.upsert({
    where: {
      userId_tenantId_roleId: {
        userId: row.userId,
        tenantId: row.tenantId,
        roleId: row.roleId,
      },
    },
    create: row,
    update: {},
  })
  criados++
}

console.log(`\n✅ criados=${criados}`)
await db.$disconnect()
