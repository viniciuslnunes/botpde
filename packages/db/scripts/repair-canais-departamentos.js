/**
 * Backfill: canais internos por departamento e por área de atuação.
 *
 * Cria `Conversa` tipo CANAL quando `canalConversaId` está nulo, popula
 * `MembroConversa` (equipe + gestores; áreas + gestores do dept pai) e é
 * idempotente. `criadoPorId` usa owner/admin/sócio do tenant; se o tenant
 * seed nacional ainda não tem user, cai no 1º User da base (mesmo padrão de
 * `ensure-canais-oficiais-torcidas.js`).
 *
 *   pnpm --filter @torcida/db db:repair-canais-departamentos
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db db:repair-canais-departamentos
 *   pnpm --filter @torcida/db db:repair-canais-departamentos -- --dry-run
 */
import { db, ensureCanaisDepartamentosTenant } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')
const tenantSlug = process.env.TENANT_SLUG?.trim() || null
const CONCURRENCY = Number(process.env.CONCURRENCY || 4)

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
  where: {
    ativo: true,
    sintetico: false,
    ...(tenantSlug ? { slug: tenantSlug } : {}),
  },
  select: { id: true, nome: true, slug: true },
  orderBy: { nome: 'asc' },
})

if (tenants.length === 0) {
  console.error(tenantSlug ? `Tenant ${tenantSlug} não encontrado.` : 'Nenhum tenant ativo.')
  process.exit(1)
}

console.log(
  `${dryRun ? '[dry-run] ' : ''}Reparando canais de departamento/área em ${tenants.length} tenant(s)…` +
    `\n  fallback criadoPor: ${fallbackUser.email ?? fallbackUser.id}`,
)

let totalDeptosCriados = 0
let totalAreasCriadas = 0
let totalSemUser = 0
let done = 0

await mapPool(tenants, CONCURRENCY, async (tenant) => {
  if (dryRun) {
    const [semCanalDepto, semCanalArea] = await Promise.all([
      db.departamento.count({ where: { tenantId: tenant.id, canalConversaId: null } }),
      db.departamentoArea.count({ where: { tenantId: tenant.id, canalConversaId: null } }),
    ])
    done += 1
    if (semCanalDepto + semCanalArea > 0 || done % 50 === 0 || done === tenants.length) {
      console.log(
        `  · [${done}/${tenants.length}] ${tenant.slug}: criaria ${semCanalDepto} depto(s) + ${semCanalArea} área(s)`,
      )
    }
    totalDeptosCriados += semCanalDepto
    totalAreasCriadas += semCanalArea
    return
  }

  const result = await ensureCanaisDepartamentosTenant(db, tenant.id, {
    criadoPorId: fallbackUser.id,
  })
  totalDeptosCriados += result.deptos.criados
  totalAreasCriadas += result.areas.criadas
  totalSemUser += result.deptos.semUser + result.areas.semUser
  done += 1
  const mudou = result.deptos.criados + result.areas.criadas > 0
  if (mudou || done % 25 === 0 || done === tenants.length) {
    console.log(
      `  · [${done}/${tenants.length}] ${tenant.slug}: deptos +${result.deptos.criados}/sync ${result.deptos.sincronizados}; ` +
        `áreas +${result.areas.criadas}/sync ${result.areas.sincronizadas}` +
        (result.deptos.semUser + result.areas.semUser
          ? ` (sem user: ${result.deptos.semUser + result.areas.semUser})`
          : ''),
    )
  }
})

console.log(
  `\nPronto. Canais depto criados: ${totalDeptosCriados}; áreas: ${totalAreasCriadas}` +
    (totalSemUser ? `; sem user (FK): ${totalSemUser}` : '') +
    (dryRun ? ' (dry-run)' : '') +
    '.',
)

process.exit(0)
