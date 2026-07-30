/**
 * Backfill: todo `SaasMembro` APROVADO entra no canal oficial da própria
 * unidade (`sedeId` → `Sede.canalConversaId`) e no canal da SEDE do mesmo
 * tenant — a mesma regra de `vincularMembroCanaisAposAprovacao`
 * (apps/web/src/lib/canais.ts), sem importar Next.js (`server-only` /
 * `next/cache`).
 *
 * Cobre seed em lote / importações / aprovações anteriores ao auto-vínculo.
 * Pedido de entrada prévio (`PENDENTE`) ou saída (`saiuEm`) → promove a
 * `ATIVO` com `saiuEm: null`.
 *
 * Uso:
 *   node scripts/repair-aprovado-canal-membro.js
 *   node scripts/repair-aprovado-canal-membro.js --dry-run
 *   node scripts/repair-aprovado-canal-membro.js --tenant=pde-gavioes-fiel
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))
const tenantSlug = tenantArg ? tenantArg.slice('--tenant='.length) : null

let tenantFilter = {}
if (tenantSlug) {
  const t = await db.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, nome: true },
  })
  if (!t) {
    console.error(`Tenant '${tenantSlug}' não encontrado.`)
    process.exit(1)
  }
  tenantFilter = { tenantId: t.id }
  console.log(`Escopo: ${t.nome} (${t.slug})\n`)
}

const sedes = await db.sede.findMany({
  where: {
    ...(tenantFilter.tenantId ? { tenantId: tenantFilter.tenantId } : {}),
    canalConversaId: { not: null },
  },
  select: { id: true, tenantId: true, tipo: true, canalConversaId: true },
})

/** @type {Map<string, string>} sedeId → canalConversaId */
const canalPorSedeId = new Map()
/** @type {Map<string, string>} tenantId → canal da SEDE */
const canalSedePorTenant = new Map()
for (const s of sedes) {
  if (s.canalConversaId) {
    canalPorSedeId.set(s.id, s.canalConversaId)
    if (s.tipo === 'SEDE') canalSedePorTenant.set(s.tenantId, s.canalConversaId)
  }
}

const aprovados = await db.saasMembro.findMany({
  where: { status: 'APROVADO', ...tenantFilter },
  select: { userId: true, tenantId: true, sedeId: true },
})

/** @type {Map<string, Set<string>>} conversaId → userIds desejados */
const desejadosPorCanal = new Map()
let semCanal = 0

for (const m of aprovados) {
  const canalIds = new Set()
  if (m.sedeId) {
    const c = canalPorSedeId.get(m.sedeId)
    if (c) canalIds.add(c)
  }
  const sede = canalSedePorTenant.get(m.tenantId)
  if (sede) canalIds.add(sede)

  if (canalIds.size === 0) {
    semCanal++
    continue
  }

  for (const conversaId of canalIds) {
    let set = desejadosPorCanal.get(conversaId)
    if (!set) {
      set = new Set()
      desejadosPorCanal.set(conversaId, set)
    }
    set.add(m.userId)
  }
}

const canalIds = [...desejadosPorCanal.keys()]
const existentes =
  canalIds.length === 0
    ? []
    : await db.membroConversa.findMany({
        where: { conversaId: { in: canalIds } },
        select: { conversaId: true, userId: true, status: true, saiuEm: true },
      })

/** @type {Map<string, { status: string, saiuEm: Date | null }>} */
const existenteMap = new Map(
  existentes.map((e) => [`${e.conversaId}:${e.userId}`, { status: e.status, saiuEm: e.saiuEm }]),
)

const paraCriar = []
const paraPromover = [] // PENDENTE / saiuEm set → ATIVO

for (const [conversaId, userIds] of desejadosPorCanal) {
  for (const userId of userIds) {
    const key = `${conversaId}:${userId}`
    const atual = existenteMap.get(key)
    if (!atual) {
      paraCriar.push({
        id: crypto.randomUUID(),
        conversaId,
        userId,
        papel: 'MEMBRO',
        status: 'ATIVO',
      })
      continue
    }
    if (atual.status !== 'ATIVO' || atual.saiuEm != null) {
      paraPromover.push({ conversaId, userId })
    }
  }
}

console.log(
  `Aprovados: ${aprovados.length} · pares a criar: ${paraCriar.length} · a promover: ${paraPromover.length} · sem canal provisionado: ${semCanal}`,
)

if (dryRun) {
  console.log('\n(--dry-run) nenhuma escrita.')
  process.exit(0)
}

let criados = 0
const BATCH = 500
for (let i = 0; i < paraCriar.length; i += BATCH) {
  const lote = paraCriar.slice(i, i + BATCH)
  const res = await db.membroConversa.createMany({ data: lote, skipDuplicates: true })
  criados += res.count
}

let promovidos = 0
for (const { conversaId, userId } of paraPromover) {
  await db.membroConversa.update({
    where: { conversaId_userId: { conversaId, userId } },
    data: { status: 'ATIVO', saiuEm: null },
  })
  promovidos++
}

console.log(`\n✅ criados=${criados} · promovidos=${promovidos}`)
process.exit(0)
