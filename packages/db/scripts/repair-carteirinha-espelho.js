/**
 * Backfill: sócio Caso B aprovado na unidade ficava com carteirinha
 * (`SaasSocio`) só no tenant da origem. O espelho na Sede raiz seguia
 * `APROVADO` sem carteirinha — some das abas Emitidas/Ativos de
 * `/admin/socios` (que leem `SaasSocio`) e é tratado como sócio sem
 * carteirinha nos gates que checam `SaasSocio.validade`.
 *
 * Copia a carteirinha entre o par origem↔espelho, no sentido em que ela
 * existe, preservando nº, validade e data de expedição. Idempotente: par que
 * já tem carteirinha dos dois lados é ignorado; divergência de validade é
 * apenas reportada (resolver é decisão humana, não do script).
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-carteirinha-espelho
 *   pnpm --filter @torcida/db db:repair-carteirinha-espelho -- --dry-run
 */
import { randomBytes } from 'node:crypto'
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')

const espelhos = await db.saasMembro.findMany({
  where: {
    espelhado: true,
    status: 'APROVADO',
    desligadoEm: null,
    tipo: 'SOCIO',
    membroOrigemId: { not: null },
  },
  select: {
    id: true,
    tenantId: true,
    userId: true,
    nome: true,
    numeroAssociado: true,
    membroOrigemId: true,
  },
})

const origens = await db.saasMembro.findMany({
  where: { id: { in: espelhos.map((e) => e.membroOrigemId) } },
  select: {
    id: true,
    tenantId: true,
    userId: true,
    nome: true,
    numeroAssociado: true,
    status: true,
    desligadoEm: true,
    tipo: true,
  },
})
const origemPorId = new Map(origens.map((o) => [o.id, o]))

const userIds = [...new Set(espelhos.map((e) => e.userId))]
const tenantIds = [
  ...new Set([...espelhos.map((e) => e.tenantId), ...origens.map((o) => o.tenantId)]),
]
const carteirinhas = await db.saasSocio.findMany({
  where: { userId: { in: userIds }, tenantId: { in: tenantIds } },
  select: {
    id: true,
    tenantId: true,
    userId: true,
    numeroSocio: true,
    nome: true,
    validade: true,
    expedidoEm: true,
  },
})
const carteirinhaPorChave = new Map(
  carteirinhas.map((c) => [`${c.tenantId}:${c.userId}`, c]),
)

/** Números já ocupados por outra pessoa no tenant destino. */
const numerosPorTenant = new Map()
for (const c of carteirinhas) {
  if (!numerosPorTenant.has(c.tenantId)) numerosPorTenant.set(c.tenantId, new Map())
  numerosPorTenant.get(c.tenantId).set(c.numeroSocio, c.userId)
}

const paraCriar = []
let jaOk = 0
let semNenhuma = 0
let origemInvalida = 0
let validadeDivergente = 0
const conflitos = []

for (const espelho of espelhos) {
  const origem = origemPorId.get(espelho.membroOrigemId)
  if (!origem || origem.tipo !== 'SOCIO' || origem.status !== 'APROVADO' || origem.desligadoEm) {
    origemInvalida++
    continue
  }

  const doEspelho = carteirinhaPorChave.get(`${espelho.tenantId}:${espelho.userId}`)
  const daOrigem = carteirinhaPorChave.get(`${origem.tenantId}:${origem.userId}`)

  if (doEspelho && daOrigem) {
    jaOk++
    if (doEspelho.validade.getTime() !== daOrigem.validade.getTime()) {
      validadeDivergente++
      console.warn(
        `  ⚠ validade divergente · ${origem.nome} · origem ${daOrigem.validade
          .toISOString()
          .slice(0, 10)} × sede ${doEspelho.validade.toISOString().slice(0, 10)}`,
      )
    }
    continue
  }
  if (!doEspelho && !daOrigem) {
    semNenhuma++
    continue
  }

  const fonte = daOrigem ?? doEspelho
  const destinoTenantId = daOrigem ? espelho.tenantId : origem.tenantId
  const destinoNome = daOrigem ? espelho.nome : origem.nome

  const ocupadoPor = numerosPorTenant.get(destinoTenantId)?.get(fonte.numeroSocio)
  if (ocupadoPor && ocupadoPor !== espelho.userId) {
    conflitos.push({
      nome: destinoNome,
      numeroSocio: fonte.numeroSocio,
      tenantId: destinoTenantId,
    })
    continue
  }

  paraCriar.push({
    tenantId: destinoTenantId,
    userId: espelho.userId,
    numeroSocio: fonte.numeroSocio,
    nome: destinoNome,
    validade: fonte.validade,
    expedidoEm: fonte.expedidoEm,
    origemTenantId: fonte.tenantId,
  })
  if (!numerosPorTenant.has(destinoTenantId)) numerosPorTenant.set(destinoTenantId, new Map())
  numerosPorTenant.get(destinoTenantId).set(fonte.numeroSocio, espelho.userId)
}

console.log(
  `Espelhos SOCIO: ${espelhos.length} · a emitir: ${paraCriar.length} · já ok: ${jaOk} ` +
    `(validade divergente: ${validadeDivergente}) · sem carteirinha nos dois lados: ${semNenhuma} ` +
    `· origem inválida: ${origemInvalida} · conflito de nº: ${conflitos.length}`,
)
for (const c of conflitos) {
  console.warn(`  ⚠ nº ${c.numeroSocio} já ocupado no tenant ${c.tenantId} · ${c.nome}`)
}

if (dryRun) {
  console.log('\n(--dry-run) nenhuma escrita.')
  await db.$disconnect()
  process.exit(0)
}

let criadas = 0
let falhas = 0
for (const row of paraCriar) {
  try {
    const socio = await db.saasSocio.create({
      data: {
        tenantId: row.tenantId,
        userId: row.userId,
        numeroSocio: row.numeroSocio,
        nome: row.nome,
        validade: row.validade,
        expedidoEm: row.expedidoEm,
        qrToken: randomBytes(24).toString('base64url'),
        qrEmitidoEm: new Date(),
      },
      select: { id: true },
    })
    await db.auditLog.create({
      data: {
        tenantId: row.tenantId,
        acao: 'SOCIO_CARTEIRINHA_EMITIDA',
        entidade: 'SaasSocio',
        entidadeId: socio.id,
        detalhes: {
          nome: row.nome,
          numeroSocio: row.numeroSocio,
          validade: row.validade.toISOString().slice(0, 10),
          espelho: true,
          origemTenantId: row.origemTenantId,
          repair: 'repair-carteirinha-espelho',
        },
      },
    })
    criadas++
  } catch (err) {
    falhas++
    console.error(`  ✖ ${row.nome} (nº ${row.numeroSocio})`, err?.message ?? err)
  }
}

console.log(`\n✅ carteirinhas emitidas=${criadas} · falhas=${falhas}`)
await db.$disconnect()
