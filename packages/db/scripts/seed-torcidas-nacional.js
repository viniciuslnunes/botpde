/**
 * Seed nacional de torcidas organizadas (Tenant + Sede + cargos de sistema).
 * Fonte: `src/data/torcidas-brasil.js` (diretório nacional).
 *
 * Cria tenants "vazios" (sem owner) para aparecerem no onboarding;
 * a propriedade pode ser transferida depois via admin.
 *
 *   pnpm --filter @torcida/db seed:torcidas-nacional
 *   pnpm --filter @torcida/db seed:torcidas-nacional -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../types/src/permissions.js'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'
import { normalizeNome } from '../src/data/afiliacoes-normalize.js'
import { upsertDepartamentosCanonicos, upsertPerfisDepartamentoCanonicos } from '../src/departamentos-canonicos.js'

const DRY_RUN = process.argv.includes('--dry-run')
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
    cor: '#0ea5e9',
    ordem: 95,
    permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE],
  },
  {
    nome: SYSTEM_ROLES.ADMIN,
    cor: '#3b82f6',
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

async function ensureSystemRoles(tenantId) {
  for (const roleData of SYSTEM_ROLE_DEFS) {
    await db.role.upsert({
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
    })
  }
  await upsertDepartamentosCanonicos(db, tenantId)
  await upsertPerfisDepartamentoCanonicos(db, tenantId, { incluirVice: true })
}

async function main() {
  console.log(`Seed de torcidas — ${TORCIDAS_BRASIL.length} entradas no dataset.`)
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
  let semClube = 0

  for (const torcida of TORCIDAS_BRASIL) {
    const afiliacaoId = resolverAfiliacaoId(torcida.clube, torcida.estado, indiceAfiliacao)
    if (!afiliacaoId) {
      semClube += 1
      console.warn(`  ! sem Afiliacao: ${torcida.nome} (${torcida.clube}/${torcida.estado})`)
      continue
    }

    if (DRY_RUN) {
      console.log(`  · ${torcida.slug} → ${torcida.nome} (${torcida.clube})`)
      continue
    }

    const existente = await db.tenant.findUnique({ where: { slug: torcida.slug } })
    const tenant = await db.tenant.upsert({
      where: { slug: torcida.slug },
      create: {
        slug: torcida.slug,
        nome: torcida.nome,
        corPrimaria: torcida.corPrimaria ?? '#7c3aed',
        afiliacaoId,
        ativo: true,
      },
      update: {
        nome: torcida.nome,
        corPrimaria: torcida.corPrimaria ?? '#7c3aed',
        afiliacaoId,
        ativo: true,
      },
    })

    if (existente) atualizados += 1
    else criados += 1

    await ensureSystemRoles(tenant.id)

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
  }

  console.log('\nResumo:')
  console.log(`  tenants criados     : ${criados}`)
  console.log(`  tenants atualizados : ${atualizados}`)
  console.log(`  sem clube no banco  : ${semClube}`)
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
