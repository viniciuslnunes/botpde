/**
 * Semeia `RivalidadeClube` com o dataset curado de rivalidades intraestaduais
 * e classifica o escopo dos pares que já existem.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:rivalidades-clubes
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:rivalidades-clubes -- --dry-run
 *
 * Por que importa: `RivalidadeClube` é o único insumo do isolamento por
 * rivalidade (`tenantsAreRivais` / `rivaisEntre` em `apps/web/src/lib/hierarquia.ts`).
 * Antes deste seed havia 12 pares no banco, todos vindos do lote de teste
 * (`scripts/lib/lote-nacional.js`) — Remo x Paysandu, Ba-Vi, Clássico-Rei e
 * Atletiba simplesmente não isolavam.
 *
 * Escopo: pares de UFs diferentes são marcados `INTERESTADUAL` e NÃO isolam
 * (ver `ESCOPOS_RIVALIDADE_ISOLANTE` em `packages/types/src/rivalidade.js`).
 * O dataset curado só contém pares intraestaduais; a classificação existe para
 * o que já estava gravado.
 *
 * Ética: rivalidade é dado sensível — serve a isolamento e moderação, nunca a
 * ranking de inimizade (docs/knowledge/README.md, protocolo item 4).
 */
import { PrismaClient } from '@prisma/client'
import { RIVALIDADES_CLUBES } from '../src/data/rivalidades-clubes.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import { chaveIndice, indexarClubes, melhorCandidato, agruparPorUf } from './lib/catalogo-clubes.js'
import { normalizeNome } from '../src/data/afiliacoes-normalize.js'

prepareSeedEnv({ scriptLabel: 'seed:rivalidades-clubes' })

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

/** Par canônico: o banco não força simetria, o invariante `aId < bId` sim. */
function ordenarPar(a, b) {
  return a < b ? [a, b] : [b, a]
}

async function main() {
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, cidade: true },
  })
  const { indice } = indexarClubes(afiliacoes)
  const porUf = agruparPorUf(afiliacoes)

  /** @param {string} nome @param {string} uf */
  const acharClube = (nome, uf) => {
    const direto = indice.get(chaveIndice(nome, uf))
    if (direto) return direto
    const { clube, score } = melhorCandidato(nome, porUf.get(uf) ?? [])
    return score >= 0.85 ? clube : null
  }

  const existentes = await db.rivalidadeClube.findMany({
    select: { id: true, afiliacaoAId: true, afiliacaoBId: true, escopo: true, classico: true },
  })
  const jaGravado = new Map(
    existentes.map((r) => [ordenarPar(r.afiliacaoAId, r.afiliacaoBId).join('::'), r]),
  )

  /**
   * Escopo vem do BANCO, não do dataset: a cidade do clube foi corrigida por
   * `seed:ficha-clubes`, e é ela que decide se o par é da mesma praça.
   * @param {{estado: string | null, cidade: string | null}} a
   * @param {{estado: string | null, cidade: string | null}} b
   */
  const escopoDe = (a, b) => {
    if (a.estado !== b.estado) return 'INTERESTADUAL'
    const ca = normalizeNome(a.cidade ?? '')
    const cb = normalizeNome(b.cidade ?? '')
    return ca && ca === cb ? 'MUNICIPAL' : 'ESTADUAL'
  }

  let criados = 0
  let atualizados = 0
  let ignorados = 0
  const semClube = []

  for (const par of RIVALIDADES_CLUBES) {
    // `isola: false` = clássico documentado que NÃO justifica sumir da malha
    // (Guarani x São Paulo, Figueirense x Criciúma). Fica no dataset como
    // contexto e não vira `RivalidadeClube`.
    if (!par.isola) {
      ignorados += 1
      continue
    }
    const a = acharClube(par.a, par.uf)
    const b = acharClube(par.b, par.uf)
    if (!a || !b || a.id === b.id) {
      semClube.push(`${par.a} x ${par.b} (${par.uf}) — falta ${!a ? par.a : par.b}`)
      continue
    }
    const [aId, bId] = ordenarPar(a.id, b.id)
    const chave = `${aId}::${bId}`
    const existente = jaGravado.get(chave)
    const escopo = escopoDe(a, b)

    if (existente) {
      const precisa = existente.escopo !== escopo || (par.classico && !existente.classico)
      if (!precisa) continue
      if (!DRY_RUN) {
        await db.rivalidadeClube.update({
          where: { id: existente.id },
          data: {
            escopo,
            classico: existente.classico ?? par.classico,
            fonte: 'dataset:rivalidades-clubes',
          },
        })
      }
      atualizados += 1
      continue
    }

    if (!DRY_RUN) {
      await db.rivalidadeClube.create({
        data: {
          afiliacaoAId: aId,
          afiliacaoBId: bId,
          escopo,
          classico: par.classico,
          fonte: 'dataset:rivalidades-clubes',
        },
      })
    }
    criados += 1
    console.log(`  + ${a.nome} x ${b.nome} (${par.uf})${par.classico ? ` — ${par.classico}` : ''}`)
  }

  // Classifica o que já estava gravado e não veio do dataset (lote de teste).
  const idPorClube = new Map(afiliacoes.map((c) => [c.id, c]))
  let reclassificados = 0
  for (const r of existentes) {
    const a = idPorClube.get(r.afiliacaoAId)
    const b = idPorClube.get(r.afiliacaoBId)
    if (!a || !b) continue
    const escopo = escopoDe(a, b)
    if (r.escopo === escopo) continue
    if (!DRY_RUN) {
      await db.rivalidadeClube.update({ where: { id: r.id }, data: { escopo } })
    }
    reclassificados += 1
    if (escopo === 'INTERESTADUAL') {
      console.log(`  ! ${a.nome}/${a.estado} x ${b.nome}/${b.estado} → INTERESTADUAL (deixa de isolar)`)
    }
  }

  console.log(
    `\nRivalidades — ${criados} criadas, ${atualizados} atualizadas, ` +
      `${reclassificados} reclassificadas por escopo, ` +
      `${ignorados} pares do dataset mantidos só como contexto (isola: false).`,
  )
  if (semClube.length > 0) {
    console.log(`\n⚠ ${semClube.length} pares fora do catálogo (clube ausente):`)
    for (const linha of semClube) console.log(`   ${linha}`)
  }
  if (DRY_RUN) console.log('\n(dry-run — nada gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
