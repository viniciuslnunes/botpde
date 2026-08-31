/**
 * Aplica as correções CURADAS de clube (`clubes-correcoes-curadas.json`):
 * nome corrompido pelo scrape, UF errada, cidade ausente — e fusão de linhas
 * duplicadas do mesmo clube.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db repair:clubes-curados -- --dry-run
 *   TORCIDA_ENV=local pnpm --filter @torcida/db repair:clubes-curados
 *
 * Por que é um arquivo curado e não heurística: são exatamente os casos em que
 * Wikidata e Ogol não têm resposta ou divergem. Cada entrada carrega fonte e
 * grau de confiança — mudar um clube que já tem torcida na plataforma não pode
 * depender de palpite.
 *
 * Fusão (`merges`): move `Tenant`, `TorcidaConhecida`, `PerfilTorcedor`,
 * `Partida`, `Noticia` e `RivalidadeClube` da origem para o destino e só então
 * apaga a origem. Se sobrar qualquer vínculo, o script aborta a fusão daquele
 * par em vez de apagar — `Partida`/`Noticia` são Cascade e sumiriam em silêncio.
 */
import { PrismaClient } from '@prisma/client'
import { prepareSeedEnv } from './lib/seed-env.js'
import { lerDataset, chaveIndice, indexarClubes } from './lib/catalogo-clubes.js'

prepareSeedEnv({ scriptLabel: 'repair:clubes-curados' })

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  const dataset = lerDataset('clubes-correcoes-curadas.json')

  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, cidade: true, fundacaoAno: true },
  })
  const { indice } = indexarClubes(afiliacoes)
  /** Índice auxiliar por nome exato + UF: nomes quebrados não têm chave canônica útil. */
  const porNomeExato = new Map(
    afiliacoes.map((a) => [`${a.nome.toLowerCase()}|${a.estado ?? ''}`, a]),
  )

  /**
   * @param {{ nome: string, uf: string }} alvo
   * @returns {{ id: string, nome: string, estado: string | null, cidade: string | null, fundacaoAno: number | null } | null}
   */
  const achar = (alvo) =>
    porNomeExato.get(`${alvo.nome.toLowerCase()}|${alvo.uf}`) ??
    indice.get(chaveIndice(alvo.nome, alvo.uf)) ??
    null

  let corrigidos = 0
  let naoEncontrados = 0

  for (const correcao of dataset.correcoes ?? []) {
    const clube = achar(correcao.alvo)
    if (!clube) {
      naoEncontrados += 1
      console.log(`  ? ${correcao.alvo.nome}/${correcao.alvo.uf} — não está no catálogo`)
      continue
    }
    /** @type {Record<string, unknown>} */
    const dados = {}
    if (correcao.nome && correcao.nome !== clube.nome) dados.nome = correcao.nome
    if (correcao.uf && correcao.uf !== clube.estado) dados.estado = correcao.uf
    if (correcao.cidade && correcao.cidade !== clube.cidade) dados.cidade = correcao.cidade
    if (correcao.fundacaoAno && !clube.fundacaoAno) dados.fundacaoAno = correcao.fundacaoAno
    if (Object.keys(dados).length === 0) continue

    if (!DRY_RUN) await db.afiliacao.update({ where: { id: clube.id }, data: dados })
    corrigidos += 1
    const alteracoes = Object.entries(dados)
      .map(([campo, valor]) => `${campo}: "${clube[campo === 'estado' ? 'estado' : campo] ?? ''}" → "${valor}"`)
      .join(', ')
    console.log(`  ✓ ${clube.nome}/${clube.estado} — ${alteracoes}  [${correcao.confianca}]`)
  }

  let fundidos = 0
  for (const merge of dataset.merges ?? []) {
    const origem = achar(merge.origem)
    const destino = achar(merge.destino)
    if (!origem || !destino) {
      console.log(
        `  ? fusão ${merge.origem.nome} → ${merge.destino.nome}: ` +
          `${!origem ? 'origem' : 'destino'} não encontrado`,
      )
      continue
    }
    if (origem.id === destino.id) continue

    const movimentos = [
      ['tenant', (id) => db.tenant.updateMany({ where: { afiliacaoId: origem.id }, data: { afiliacaoId: id } })],
      ['torcidaConhecida', (id) => db.torcidaConhecida.updateMany({ where: { afiliacaoId: origem.id }, data: { afiliacaoId: id } })],
      ['perfilTorcedor', (id) => db.perfilTorcedor.updateMany({ where: { afiliacaoId: origem.id }, data: { afiliacaoId: id } })],
      ['partida', (id) => db.partida.updateMany({ where: { afiliacaoId: origem.id }, data: { afiliacaoId: id } })],
      ['noticia', (id) => db.noticia.updateMany({ where: { afiliacaoId: origem.id }, data: { afiliacaoId: id } })],
    ]

    if (DRY_RUN) {
      console.log(`  ✓ fusão (simulada) ${origem.nome}/${origem.estado} → ${destino.nome}/${destino.estado}`)
      fundidos += 1
      continue
    }

    for (const [, mover] of movimentos) await mover(destino.id)
    // Rivalidade tem par único: mover cegamente criaria (destino, destino) ou
    // colidiria com par existente. Como a origem é linha duplicada e nova,
    // rivalidade dela é ruído — apaga em vez de mover.
    await db.rivalidadeClube.deleteMany({
      where: { OR: [{ afiliacaoAId: origem.id }, { afiliacaoBId: origem.id }] },
    })

    const restantes = await db.afiliacao.findUnique({
      where: { id: origem.id },
      select: {
        _count: {
          select: { tenants: true, torcidasConhecidas: true, torcedores: true, partidas: true, noticias: true },
        },
      },
    })
    const total = Object.values(restantes?._count ?? {}).reduce((s, n) => s + n, 0)
    if (total > 0) {
      console.log(`  ⚠ fusão abortada: ${origem.nome} ainda tem ${total} vínculo(s) — nada apagado`)
      continue
    }
    await db.afiliacao.delete({ where: { id: origem.id } })
    fundidos += 1
    console.log(`  ✓ fusão ${origem.nome}/${origem.estado} → ${destino.nome}/${destino.estado}`)
  }

  console.log(
    `\nCorreções curadas — ${corrigidos} clubes corrigidos, ${fundidos} fusões, ${naoEncontrados} alvos ausentes.`,
  )
  if (DRY_RUN) console.log('(dry-run — nada gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
