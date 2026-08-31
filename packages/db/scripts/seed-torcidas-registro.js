/**
 * Normaliza a fundação das torcidas e marca a SITUAÇÃO DE REGISTRO delas na
 * federação estadual, a partir da lista oficial publicada pela FPF (SP).
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:torcidas-registro
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:torcidas-registro -- --dry-run
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:torcidas-registro -- --importar-ausentes
 *
 * Três efeitos:
 *  1. `fundacaoAno` — a fonte colaborativa grava "23/10/1992", "**\/**\/2006" e
 *     variantes; só o ano é confiável, e sem ele não dá para ordenar por
 *     antiguidade nem exibir "desde 1969";
 *  2. `situacaoRegistro` — quem está na lista da FPF vira `REGISTRADA_FEDERACAO`;
 *     as demais torcidas de SP viram `SEM_REGISTRO_CONHECIDO`. Fora de SP fica
 *     `DESCONHECIDO`: não existe lista publicada equivalente em outras federações;
 *  3. com `--importar-ausentes`, cria as torcidas que constam da lista oficial e
 *     faltam no catálogo (ex.: cinco organizadas da Ponte Preta, quatro do XV de
 *     Piracicaba, Pavilhão 9).
 *
 * Cuidado de leitura (vale para a UI): ausência da lista NÃO prova que a torcida
 * é irregular — prova que ela não constava como cadastrada naquela data. Por
 * isso o enum é `SEM_REGISTRO_CONHECIDO`, não "irregular".
 */
import { PrismaClient } from '@prisma/client'
import { gerarSlugUnico } from '../src/data/afiliacoes-normalize.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import {
  lerDataset,
  chaveIndice,
  indexarClubes,
  melhorCandidato,
  agruparPorUf,
  anoFundacaoTorcida,
  chaveTorcida,
  distanciaEdicao,
  similaridadeTrigrama,
} from './lib/catalogo-clubes.js'

prepareSeedEnv({ scriptLabel: 'seed:torcidas-registro' })

const DRY_RUN = process.argv.includes('--dry-run')
const IMPORTAR = process.argv.includes('--importar-ausentes')
const db = new PrismaClient()

async function main() {
  const fpf = lerDataset('fpf-torcidas-cadastradas-sp.json')
  const referencia = new Date(`${fpf.referencia}T00:00:00Z`)
  const fonte = 'FPF — Relação de Torcidas Cadastradas'

  const torcidas = await db.torcidaConhecida.findMany({
    select: { id: true, nome: true, uf: true, fundacao: true, fundacaoAno: true, situacaoRegistro: true },
  })

  // 1. Ano de fundação ─────────────────────────────────────────────────────
  let anos = 0
  for (const t of torcidas) {
    const ano = anoFundacaoTorcida(t.fundacao)
    if (!ano || t.fundacaoAno === ano) continue
    if (!DRY_RUN) await db.torcidaConhecida.update({ where: { id: t.id }, data: { fundacaoAno: ano } })
    anos += 1
  }

  // 2. Situação de registro (SP) ───────────────────────────────────────────
  const indiceFpf = new Map((fpf.torcidas ?? []).map((t) => [chaveTorcida(t.torcida), t]))
  const chavesFpf = [...indiceFpf.keys()]
  const casadas = new Set()
  let registradas = 0
  let semRegistro = 0

  for (const t of torcidas.filter((x) => x.uf === 'SP')) {
    const chave = chaveTorcida(t.nome)
    let hit = indiceFpf.get(chave)
    if (!hit) {
      // Variação de grafia: nome contido no outro, ou até 3 edições de distância.
      const parecida =
        chavesFpf.find(
          (k) => k.length > 6 && chave.length > 6 && (k.includes(chave) || chave.includes(k)),
        ) ?? chavesFpf.find((k) => chave.length > 6 && distanciaEdicao(k, chave) <= 3)
      if (parecida) hit = indiceFpf.get(parecida)
    }
    const situacao = hit ? 'REGISTRADA_FEDERACAO' : 'SEM_REGISTRO_CONHECIDO'
    if (hit) casadas.add(chaveTorcida(hit.torcida))
    if (t.situacaoRegistro !== situacao) {
      if (!DRY_RUN) {
        await db.torcidaConhecida.update({
          where: { id: t.id },
          data: {
            situacaoRegistro: situacao,
            registroFonte: hit ? fonte : null,
            registroEm: hit ? referencia : null,
          },
        })
      }
    }
    if (hit) registradas += 1
    else semRegistro += 1
  }

  // 3. Importar as que faltam ──────────────────────────────────────────────
  const ausentes = (fpf.torcidas ?? []).filter((t) => !casadas.has(chaveTorcida(t.torcida)))
  let criadas = 0
  let semClube = 0

  if (IMPORTAR) {
    // Segunda barreira contra duplicata: compara a candidata com TODAS as
    // torcidas de SP já cadastradas, não só com a que casou no passo 2.
    const chavesExistentesSp = torcidas
      .filter((t) => t.uf === 'SP')
      .map((t) => ({ nome: t.nome, chave: chaveTorcida(t.nome) }))
    const afiliacoes = await db.afiliacao.findMany({ select: { id: true, nome: true, estado: true } })
    const { indice } = indexarClubes(afiliacoes)
    const porUf = agruparPorUf(afiliacoes)
    const slugsUsados = new Set(
      (await db.torcidaConhecida.findMany({ select: { slug: true } })).map((t) => t.slug),
    )

    let parecidas = 0
    for (const item of ausentes) {
      const chave = chaveTorcida(item.torcida)
      // Critério apertado de propósito: nome curto de torcida é parecido com
      // tudo ("Garra Azul" x "Força Azul", "Camisa 12" x "Camisa 13" são
      // torcidas diferentes). Só barra containment, quase-igualdade
      // proporcional ao tamanho, ou trigrama muito alto.
      const parecida = chavesExistentesSp.find((t) => {
        if (t.chave.length < 6 || chave.length < 6) return false
        if (t.chave.includes(chave) || chave.includes(t.chave)) return true
        const maior = Math.max(t.chave.length, chave.length)
        if (distanciaEdicao(t.chave, chave) / maior <= 0.12) return true
        return similaridadeTrigrama(t.chave, chave) >= 0.85
      })
      if (parecida) {
        parecidas += 1
        console.log(`  ~ parecida com "${parecida.nome}" — não importada: ${item.torcida}`)
        continue
      }
      const direto = indice.get(chaveIndice(item.clube, 'SP'))
      const { clube: fuzzy, score } = melhorCandidato(item.clube, porUf.get('SP') ?? [])
      const clube = direto ?? (score >= 0.8 ? fuzzy : null)
      if (!clube) {
        semClube += 1
        console.log(`  ? sem clube no catálogo: ${item.torcida} — ${item.clube}`)
        continue
      }
      const slug = gerarSlugUnico(item.torcida, 'SP', slugsUsados)
      if (!DRY_RUN) {
        await db.torcidaConhecida.create({
          data: {
            nome: item.torcida.toLocaleUpperCase('pt-BR'),
            slug,
            afiliacaoId: clube.id,
            clubeNomeOriginal: item.clube,
            cidade: item.cidade?.split('/')[0]?.trim() ?? null,
            uf: 'SP',
            situacaoRegistro: 'REGISTRADA_FEDERACAO',
            registroFonte: fonte,
            registroEm: referencia,
            fonteUrl: fpf.arquivo ?? null,
          },
        })
      }
      criadas += 1
      console.log(`  + ${item.torcida} → ${clube.nome}`)
    }
  }

  console.log(
    `\nTorcidas — ${anos} anos de fundação normalizados; SP: ${registradas} registradas na FPF, ` +
      `${semRegistro} sem registro conhecido.`,
  )
  console.log(
    IMPORTAR
      ? `Importação — ${criadas} criadas, ${semClube} sem clube no catálogo.` +
        ' (as "parecidas" ficaram de fora para não duplicar; confirme à mão se são a mesma torcida)'
      : `${ausentes.length} torcidas da lista da FPF ainda não existem no catálogo` +
        ' (rode com --importar-ausentes para criar).',
  )
  if (DRY_RUN) console.log('(dry-run — nada gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
