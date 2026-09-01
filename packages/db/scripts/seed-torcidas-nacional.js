/**
 * Seed nacional de torcidas organizadas (Tenant + Sede + cargos de sistema).
 * Fonte: `src/data/torcidas-brasil.js` (diretório nacional).
 *
 * Cria tenants "vazios" (sem owner) para aparecerem no onboarding;
 * a propriedade pode ser transferida depois via admin.
 *
 * Departamentos/áreas: NÃO aqui — use `seed:departamentos` /
 * `seed:departamento-areas` (com concurrency). No proxy Railway, upsertar
 * depto por tenant em série deixa o seed impraticável.
 *
 *   pnpm --filter @torcida/db seed:torcidas-nacional
 *   pnpm --filter @torcida/db seed:torcidas-nacional -- --dry-run
 *   pnpm --filter @torcida/db seed:torcidas-nacional -- --somente-novos
 */
import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../types/src/permissions.js'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'
import { corArquirrivalCatalogo } from '../../types/src/design.js'
import { normalizeNome } from '../src/data/afiliacoes-normalize.js'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ scriptLabel: 'seed:torcidas-nacional' })

const DRY_RUN = process.argv.includes('--dry-run')
/** Só cria tenant/sede/roles se o slug ainda não existe (idempotente rápido). */
const SOMENTE_NOVOS = process.argv.includes('--somente-novos')
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 6)

const db = new PrismaClient()

const SYSTEM_ROLE_DEFS = [
  {
    nome: SYSTEM_ROLES.OWNER,
    cor: '#f59e0b',
    ordem: 100,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER],
  },
  {
    nome: SYSTEM_ROLES.VICE,
    cor: '#71717a',
    ordem: 95,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE],
  },
  {
    nome: SYSTEM_ROLES.ADMIN,
    cor: '#52525b',
    ordem: 90,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
  },
  {
    nome: SYSTEM_ROLES.MEMBER,
    cor: '#6b7280',
    ordem: 0,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
  },
]

/** @param {string} clube @param {string} estado @param {Map<string, string>} indice */
function resolverAfiliacaoId(clube, estado, indice) {
  const chave = `${normalizeNome(clube)}|${normalizeNome(estado)}`
  return indice.get(chave) ?? null
}

/** @param {string} tenantId */
async function ensureSystemRolesOnly(tenantId) {
  await Promise.all(
    SYSTEM_ROLE_DEFS.map((roleData) =>
      db.role.upsert({
        where: { tenantId_nome: { tenantId, nome: roleData.nome } },
        update: { permissions: roleData.permissions },
        create: {
          tenantId,
          nome: roleData.nome,
          cor: roleData.cor,
          ordem: roleData.ordem,
          isSystem: true,
          permissions: roleData.permissions,
        },
      }),
    ),
  )
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<void>} worker
 */
async function mapPool(items, concurrency, worker) {
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next
      next += 1
      await worker(items[i], i)
    }
  }
  const n = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function main() {
  console.log(`Seed de torcidas — ${TORCIDAS_BRASIL.length} entradas no dataset.`)
  console.log(`  concurrency=${CONCURRENCY}${SOMENTE_NOVOS ? ' · somente-novos' : ''}`)
  if (DRY_RUN) console.log('(dry-run: sem gravação)')

  /** @type {Map<string, string>} chave clube|uf → afiliacaoId */
  const indiceAfiliacao = new Map()
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true },
  })
  for (const a of afiliacoes) {
    if (!a.estado) continue
    indiceAfiliacao.set(`${normalizeNome(a.nome)}|${normalizeNome(a.estado)}`, a.id)
  }

  let criados = 0
  let atualizados = 0
  let pulados = 0
  let semClube = 0
  let done = 0

  await mapPool(TORCIDAS_BRASIL, CONCURRENCY, async (torcida) => {
    const afiliacaoId = resolverAfiliacaoId(torcida.clube, torcida.estado, indiceAfiliacao)
    if (!afiliacaoId) {
      semClube += 1
      console.warn(`  ! sem Afiliacao: ${torcida.nome} (${torcida.clube}/${torcida.estado})`)
      return
    }

    if (DRY_RUN) {
      console.log(`  · ${torcida.slug} → ${torcida.nome} (${torcida.clube})`)
      return
    }

    const existente = await db.tenant.findUnique({
      where: { slug: torcida.slug },
      select: { id: true },
    })

    if (SOMENTE_NOVOS && existente) {
      pulados += 1
      done += 1
      if (done % 10 === 0 || done === TORCIDAS_BRASIL.length) {
        console.log(`  … ${done}/${TORCIDAS_BRASIL.length}`)
      }
      return
    }

    const corArquirrival =
      torcida.corArquirrival ??
      corArquirrivalCatalogo({ slug: torcida.slug, clubeNome: torcida.clube })

    const tenant = await db.tenant.upsert({
      where: { slug: torcida.slug },
      create: {
        slug: torcida.slug,
        nome: torcida.nome,
        corPrimaria: torcida.corPrimaria ?? '#7c3aed',
        corArquirrival,
        afiliacaoId,
        ativo: true,
      },
      update: {
        nome: torcida.nome,
        corPrimaria: torcida.corPrimaria ?? '#7c3aed',
        corArquirrival,
        afiliacaoId,
        ativo: true,
      },
      select: { id: true },
    })

    if (existente) atualizados += 1
    else criados += 1

    await ensureSystemRolesOnly(tenant.id)

    const sedeId = torcida.sedeId ?? `sede-principal-${torcida.slug}`
    await db.sede.upsert({
      where: { id: sedeId },
      create: {
        id: sedeId,
        tenantId: tenant.id,
        nome: `Sede — ${torcida.nome}`,
        tipo: 'SEDE',
        cidade: torcida.cidade ?? null,
        estado: torcida.estado,
        ativa: true,
      },
      update: {
        tenantId: tenant.id,
        nome: `Sede — ${torcida.nome}`,
        ativa: true,
      },
    })

    done += 1
    console.log(`  ✓ ${torcida.slug} (${done}/${TORCIDAS_BRASIL.length})`)
  })

  console.log('\nResumo:')
  console.log(`  tenants criados     : ${criados}`)
  console.log(`  tenants atualizados : ${atualizados}`)
  console.log(`  pulados (já existiam): ${pulados}`)
  console.log(`  sem clube no banco  : ${semClube}`)
  console.log('  (departamentos/áreas: rode seed:departamentos + seed:departamento-areas)')
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
