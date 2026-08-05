/**
 * Backfill: sócio Caso B aprovado na unidade ficava com carteirinha
 * (`SaasSocio`) só no tenant da origem. O espelho na Sede raiz seguia
 * `APROVADO` sem carteirinha — some das abas Emitidas/Ativos de
 * `/admin/socios` (que leem `SaasSocio`) e é tratado como sócio sem
 * carteirinha nos gates que checam `SaasSocio.validade`.
 *
 * Copia a carteirinha entre o par origem↔espelho, no sentido em que ela
 * existe, preservando nº, validade e data de expedição. Idempotente: par que
 * já tem carteirinha dos dois lados é ignorado.
 *
 * **Validade divergente** (ARCHITECTURE.md §7 20): antes só era reportada, e
 * por isso sobrevivia a quantas execuções fossem. Importa porque o gate de
 * canal resolve pelo `tenantVinculoId` — a mesma pessoa fica vigente num
 * nível e vencida no outro, e a resposta muda conforme o canal que ela abre.
 * Com `--reconciliar` o script alinha o espelho **pela origem**, que é a
 * mesma fonte de verdade de `garantirCarteirinhaNoPar`. Fica atrás de flag
 * porque mudar validade altera até quando o sócio passa na catraca — emitir o
 * que faltava é aditivo, isto não é.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-carteirinha-espelho -- --dry-run
 *   pnpm --filter @torcida/db db:repair-carteirinha-espelho
 *   pnpm --filter @torcida/db db:repair-carteirinha-espelho -- --reconciliar
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
/** Espelhos cuja validade ficou diferente da origem — ver ARCHITECTURE §7 20. */
const paraReconciliar = []
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
      // Reconciliar não era feito aqui: o script contava a divergência como
      // "já ok" e seguia, então ela sobrevivia a quantas execuções fossem.
      // Importa porque o gate de canal (`assertElegibilidadeMembroCanal`)
      // resolve pelo `tenantVinculoId`: a mesma pessoa fica vigente num nível
      // e vencida no outro, e a resposta muda conforme o canal que ela abre.
      //
      // A **origem manda** — é a mesma fonte de verdade de
      // `garantirCarteirinhaNoPar` (`apps/web/src/lib/carteirinha-espelho.ts`),
      // que copia validade e expedição da unidade para o espelho. Ver
      // ARCHITECTURE.md §7 20.
      paraReconciliar.push({
        id: doEspelho.id,
        nome: origem.nome,
        de: doEspelho.validade,
        para: daOrigem.validade,
        expedidoEm: daOrigem.expedidoEm,
        tenantId: espelho.tenantId,
        userId: espelho.userId,
      })
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
if (paraReconciliar.length > 0) {
  console.log(`  → ${paraReconciliar.length} espelho(s) com validade a reconciliar pela origem`)
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

// Reconciliação da validade divergente fica atrás de `--reconciliar`: emitir
// uma carteirinha que faltava é aditivo, mas **mudar a validade** de uma que
// já está na mão do sócio altera até quando ele passa na catraca. Quem roda
// tem de pedir isso de propósito.
let reconciliadas = 0
if (paraReconciliar.length > 0) {
  if (!process.argv.includes('--reconciliar')) {
    console.log(
      `\n⚠️  ${paraReconciliar.length} espelho(s) com validade divergente NÃO foram tocados.` +
        `\n   Rode com --reconciliar para alinhar pela origem (regra de garantirCarteirinhaNoPar):`,
    )
    for (const r of paraReconciliar) {
      console.log(
        `     ${r.nome}: sede ${r.de.toISOString().slice(0, 10)} → ${r.para.toISOString().slice(0, 10)}`,
      )
    }
  } else {
    for (const r of paraReconciliar) {
      await db.saasSocio.update({
        where: { id: r.id },
        data: { validade: r.para, expedidoEm: r.expedidoEm },
      })
      await db.auditLog.create({
        data: {
          tenantId: r.tenantId,
          acao: 'SOCIO_CARTEIRINHA_VALIDADE_RECONCILIADA',
          entidade: 'SaasSocio',
          entidadeId: r.id,
          detalhes: {
            nome: r.nome,
            validadeAnterior: r.de.toISOString().slice(0, 10),
            novaValidade: r.para.toISOString().slice(0, 10),
            fonte: 'origem',
            repair: 'repair-carteirinha-espelho',
          },
        },
      })
      reconciliadas++
      console.log(
        `  ✅ ${r.nome}: validade ${r.de.toISOString().slice(0, 10)} → ${r.para.toISOString().slice(0, 10)}`,
      )
    }
  }
}

console.log(
  `\n✅ carteirinhas emitidas=${criadas} · falhas=${falhas} · validades reconciliadas=${reconciliadas}`,
)
await db.$disconnect()
