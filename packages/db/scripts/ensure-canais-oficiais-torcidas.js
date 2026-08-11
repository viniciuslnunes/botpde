/**
 * Backfill nacional: canal oficial privado de cada torcida (Tenant ativo).
 *
 * Cria o mural do portal (`canalOficial`, `publica: false`), liga em
 * `Sede` tipo SEDE (`canalConversaId`) quando existir, e **não** cria
 * `MembroConversa` ADMIN — propriedade fica para o admin da plataforma
 * atribuir. `criadoPorId` só satisfaz a FK (owner → admin → sócio → 1º user).
 *
 * Não toca canais de SUBSEDE/PDE (Caso A) — use
 * `ensure-canais-oficiais-unidades.js` para isso.
 *
 * Idempotente. Uso:
 *   node scripts/ensure-canais-oficiais-torcidas.js
 *   node scripts/ensure-canais-oficiais-torcidas.js --dry-run
 */
import { prepareSeedEnv } from './lib/seed-env.js'
import { db } from '../src/index.js'

prepareSeedEnv({ scriptLabel: 'ensure-canais-oficiais-torcidas' })

const dryRun = process.argv.includes('--dry-run')
const CONCURRENCY = 8

async function resolverCriadoPorId(tenantId, fallbackUserId) {
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
  return fallbackUserId ?? null
}

/** IDs de canais oficiais que são mural de SUBSEDE/PDE — não são mural da torcida. */
async function idsCanaisCasoA(tenantId) {
  const rows = await db.sede.findMany({
    where: {
      tenantId,
      tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
      canalConversaId: { not: null },
    },
    select: { canalConversaId: true },
  })
  return new Set(rows.map((r) => r.canalConversaId).filter(Boolean))
}

async function ensureMuralTorcida(tenant, fallbackUserId) {
  const sedeRaiz = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE', ativa: true },
    select: { id: true, canalConversaId: true, nome: true },
    orderBy: { criadoEm: 'asc' },
  })

  if (sedeRaiz?.canalConversaId) {
    return { status: 'ja_ligado', canalId: sedeRaiz.canalConversaId }
  }

  const casoA = await idsCanaisCasoA(tenant.id)
  const oficiais = await db.conversa.findMany({
    where: { tenantId: tenant.id, tipo: 'CANAL', canalOficial: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  })
  const muralExistente = oficiais.find((c) => !casoA.has(c.id)) ?? null

  if (muralExistente) {
    if (sedeRaiz && !sedeRaiz.canalConversaId) {
      if (!dryRun) {
        await db.sede.updateMany({
          where: { id: sedeRaiz.id, canalConversaId: null },
          data: { canalConversaId: muralExistente.id },
        })
      }
      return { status: 'ligado_existente', canalId: muralExistente.id }
    }
    return { status: 'ja_existe', canalId: muralExistente.id }
  }

  const criadoPorId = await resolverCriadoPorId(tenant.id, fallbackUserId)
  if (!criadoPorId) {
    return { status: 'sem_user', canalId: null }
  }

  if (dryRun) {
    return { status: 'criaria', canalId: null }
  }

  const canal = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: tenant.id,
      nome: tenant.nome,
      descricao: 'Canal oficial da torcida',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'ALIADOS',
      somenteAdminPublica: false,
      publica: false,
      criadoPorId,
    },
    select: { id: true },
  })

  if (sedeRaiz) {
    await db.sede.updateMany({
      where: { id: sedeRaiz.id, canalConversaId: null },
      data: { canalConversaId: canal.id },
    })
  }

  return { status: 'criado', canalId: canal.id }
}

async function mapPool(items, concurrency, fn) {
  const results = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

const fallbackUser = await db.user.findFirst({
  select: { id: true, email: true },
  orderBy: { criadoEm: 'asc' },
})
if (!fallbackUser) {
  console.error('Nenhum User na base — impossível preencher criadoPorId.')
  process.exit(1)
}

const tenants = await db.tenant.findMany({
  where: { ativo: true },
  select: { id: true, nome: true, slug: true },
  orderBy: { nome: 'asc' },
})

console.log(
  `${dryRun ? '[dry-run] ' : ''}Torcidas ativas: ${tenants.length} · fallback criadoPor: ${fallbackUser.email ?? fallbackUser.id}\n`,
)

const counts = {
  criado: 0,
  criaria: 0,
  ja_ligado: 0,
  ja_existe: 0,
  ligado_existente: 0,
  sem_user: 0,
}

const results = await mapPool(tenants, CONCURRENCY, async (tenant) => {
  const r = await ensureMuralTorcida(tenant, fallbackUser.id)
  return { tenant, ...r }
})

for (const r of results) {
  counts[r.status] = (counts[r.status] ?? 0) + 1
  if (r.status === 'criado' || r.status === 'criaria' || r.status === 'ligado_existente') {
    console.log(
      `${r.status === 'criaria' ? '·' : '✅'} ${r.tenant.slug} — ${r.status}${r.canalId ? ` (${r.canalId})` : ''}`,
    )
  } else if (r.status === 'sem_user') {
    console.log(`⏭  ${r.tenant.slug} — sem user para criadoPorId`)
  }
}

console.log('\nResumo:')
for (const [k, v] of Object.entries(counts)) {
  if (v > 0) console.log(`  ${k}: ${v}`)
}

await db.$disconnect()
process.exit(counts.sem_user > 0 && counts.criado + counts.criaria === 0 ? 1 : 0)
