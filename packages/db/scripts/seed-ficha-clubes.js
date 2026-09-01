/**
 * Preenche a FICHA do clube em `Afiliacao` a partir dos datasets offline:
 * ano de fundação, estádio (nome, capacidade, coordenada), site oficial,
 * cores e ids externos (Wikidata QID, Ogol).
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes -- --dry-run
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-cidades
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-ficha
 *
 * Precedência das fontes, por campo:
 * - fundação/estádio/site/QID → Wikidata; fundação cai para o Ogol se faltar;
 * - cores → paleta CURADA (`@torcida/types` CLUBE_PALETAS) primeiro; só quem não
 *   tem curadoria recebe a cor derivada do escudo (`cores-escudos.json`), sempre
 *   com `coresFonte` explicitando qual foi;
 * - cidade → NÃO é sobrescrita por padrão. Com `--corrigir-cidades`, corrige
 *   apenas quando a cidade atual não é município da UF (malha do IBGE) E as
 *   fontes externas concordam entre si. Divergência vira relatório, não escrita.
 *
 * Qual entidade do Wikidata é o clube: `criarResolvedorWikidata`
 * (`lib/catalogo-clubes.js`). Nome+UF não separa homônimo, e o time feminino, o
 * time B e o clube extinto têm o MESMO rótulo do principal — o índice ingênuo
 * pegava o primeiro do arquivo e a ficha do Corinthians virava a do time
 * feminino (achado de 2026-09-01). Sem desempate por evidência, o clube fica
 * SEM ficha e entra no relatório: palpite não é fonte.
 *
 * Nada aqui é irreversível: todos os campos são aditivos e o script só escreve
 * o que está vazio, exceto cidade sob `--corrigir-cidades` e a ficha do Wikidata
 * sob `--corrigir-ficha` (que reescreve só quem está ancorado no QID errado).
 */
import { PrismaClient } from '@prisma/client'
// `@torcida/db` não depende de `@torcida/types` no package.json; script de seed
// lê o módulo pelo caminho do monorepo (mesmo padrão do JSON de municípios).
import { CLUBE_PALETAS, CLUBE_PALETA_ALIASES } from '../../types/src/design.js'
import { normalizeNome } from '../src/data/afiliacoes-normalize.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import {
  chaveIndice,
  lerDataset,
  carregarMunicipios,
  validadorCidade,
  melhorCandidato,
  agruparPorUf,
  criarResolvedorWikidata,
  lerCuradoriaWikidata,
} from './lib/catalogo-clubes.js'

prepareSeedEnv({ scriptLabel: 'seed:ficha-clubes' })

const DRY_RUN = process.argv.includes('--dry-run')
const CORRIGIR_CIDADES = process.argv.includes('--corrigir-cidades')
const CORRIGIR_FICHA = process.argv.includes('--corrigir-ficha')
const db = new PrismaClient()

/**
 * `"1914-01-01"` / `"2019"` → ano. Só o ano: as fontes marcam precisão de ano
 * com 1º de janeiro, e gravar data cheia inventaria um dia que ninguém publicou.
 * @param {string | number | null | undefined} valor
 * @returns {number | null}
 */
export function anoDe(valor) {
  const m = /(\d{4})/.exec(String(valor ?? ''))
  if (!m) return null
  const ano = Number(m[1])
  return ano >= 1850 && ano <= new Date().getFullYear() ? ano : null
}

/**
 * Paleta curada do clube, se houver — mesma resolução usada pelo Estúdio Design.
 * @param {string} nome
 * @param {string | null} apelido
 * @returns {{ primary: string, secondary: string, accents?: string[] } | null}
 */
function paletaCurada(nome, apelido) {
  for (const candidato of [nome, apelido]) {
    if (!candidato) continue
    const chave = normalizeNome(candidato)
    const alvo = CLUBE_PALETA_ALIASES[chave] ?? chave
    if (CLUBE_PALETAS[alvo]) return CLUBE_PALETAS[alvo]
  }
  return null
}

async function main() {
  const ogolBruto = lerDataset('ogol-clubes-brasil.json')
  const cores = lerDataset('cores-escudos.json')
  const cidades = validadorCidade(carregarMunicipios())
  const { valida: cidadeValida } = cidades

  const afiliacoes = await db.afiliacao.findMany({
    select: {
      id: true, nome: true, apelido: true, estado: true, cidade: true,
      fundacaoAno: true, estadio: true, estadioCapacidade: true, estadioLat: true,
      estadioLng: true, siteOficial: true, corPrimaria: true, coresFonte: true,
      wikidataQid: true, ogolId: true,
    },
  })

  // Wikidata passa pelo resolvedor: nome+UF não separa homônimo, e o clube
  // principal, o time feminino e o clube extinto compartilham o mesmo rótulo.
  const { resolver } = criarResolvedorWikidata(
    lerDataset('wikidata-clubes-br.json'),
    cidades,
    lerCuradoriaWikidata(lerDataset('clubes-correcoes-curadas.json')),
  )

  /** @type {Map<string, object>} */
  const idxOgol = new Map()
  for (const o of ogolBruto.clubes ?? []) {
    if (!o.uf) continue
    for (const nome of [o.titulo, o.nomeOficial].filter(Boolean)) {
      const chave = chaveIndice(nome, o.uf)
      if (!idxOgol.has(chave)) idxOgol.set(chave, o)
    }
  }
  const idxCores = new Map(
    (cores.clubes ?? []).map((c) => [chaveIndice(c.nome, c.uf), c]),
  )
  const porUfCores = agruparPorUf(cores.clubes ?? [])

  const contagem = {
    fundacao: 0, estadio: 0, capacidade: 0, coordenada: 0, site: 0,
    coresCuradas: 0, coresEscudo: 0, qid: 0, ogol: 0, cidadeCorrigida: 0,
    fichaReancorada: 0,
  }
  const cidadesParaRevisar = []
  const ambiguos = []
  const reancorados = []

  for (const clube of afiliacoes) {
    const chave = chaveIndice(clube.nome, clube.estado)
    const { clube: w, motivo, candidatos } = resolver(clube)
    if (motivo === 'ambiguo') {
      ambiguos.push(
        `${clube.nome}/${clube.estado}: ${candidatos.map((x) => `${x.qid} (${x.nome})`).join(' ou ')}`,
      )
    } else if (motivo === 'curado-qid-ausente') {
      ambiguos.push(`${clube.nome}/${clube.estado}: QID curado não existe no dataset do Wikidata`)
    }
    const o = idxOgol.get(chave)
    const c =
      idxCores.get(chave) ??
      (() => {
        const { clube: achado, score } = melhorCandidato(
          clube.nome,
          porUfCores.get(String(clube.estado ?? '').toUpperCase()) ?? [],
        )
        return score >= 0.85 ? achado : null
      })()

    /** @type {Record<string, unknown>} */
    const dados = {}

    const ano = anoDe(w?.fundacao) ?? anoDe(o?.fundacao)

    // Realinhamento da ficha do Wikidata. Preencher só o vazio não resolve dois
    // casos: a ficha ancorada em OUTRA entidade (time feminino, clube extinto,
    // homônimo de outra cidade) e o valor que mudou na fonte (o Morumbi estava
    // gravado com 120.000 — o recorde de 1977, não a lotação). Fica atrás de
    // flag porque sobrescrever é a única operação não aditiva do script; é
    // seguro porque esses campos não são editáveis no admin, vêm sempre da
    // fonte externa.
    if (w) {
      const trocouEntidade = Boolean(clube.wikidataQid && clube.wikidataQid !== w.qid)
      const desejado = {
        wikidataQid: w.qid,
        // Fundação só é realinhada quando a ENTIDADE muda: aí o ano gravado era
        // de outro clube. Com a entidade certa, o ano pode ter vindo do Ogol ou
        // da curadoria (que às vezes é melhor que o Wikidata — Duque de Caxias),
        // e sobrescrever seria trocar uma fonte boa por outra sem ganho.
        fundacaoAno: trocouEntidade ? (ano ?? clube.fundacaoAno) : clube.fundacaoAno,
        estadio: w.estadio ?? null,
        estadioCapacidade: w.capacidade ? Math.round(w.capacidade) : null,
        estadioLat: w.estadioLat ?? null,
        estadioLng: w.estadioLng ?? null,
        siteOficial: w.site ? w.site.slice(0, 300) : clube.siteOficial,
      }
      const divergentes = Object.entries(desejado).filter(
        ([campo, valor]) => String(clube[campo] ?? '') !== String(valor ?? ''),
      )
      if (divergentes.length > 0 && clube.wikidataQid) {
        reancorados.push(
          trocouEntidade
            ? `${clube.nome}/${clube.estado}: ${clube.wikidataQid} → ${w.qid} (${w.nome}, ${motivo})`
            : `${clube.nome}/${clube.estado}: ${divergentes
                .map(([campo, valor]) => `${campo} "${clube[campo] ?? ''}" → "${valor ?? ''}"`)
                .join(', ')}`,
        )
        if (CORRIGIR_FICHA) {
          for (const [campo, valor] of divergentes) dados[campo] = valor
          contagem.fichaReancorada += 1
        }
      }
    }

    if (ano && !clube.fundacaoAno) { dados.fundacaoAno = ano; contagem.fundacao += 1 }

    if (w?.estadio && !clube.estadio) { dados.estadio = w.estadio; contagem.estadio += 1 }
    if (w?.capacidade && !clube.estadioCapacidade) {
      dados.estadioCapacidade = Math.round(w.capacidade)
      contagem.capacidade += 1
    }
    if (w?.estadioLat != null && clube.estadioLat == null) {
      dados.estadioLat = w.estadioLat
      dados.estadioLng = w.estadioLng
      contagem.coordenada += 1
    }
    if (w?.site && !clube.siteOficial) { dados.siteOficial = w.site.slice(0, 300); contagem.site += 1 }
    if (w?.qid && !clube.wikidataQid) { dados.wikidataQid = w.qid; contagem.qid += 1 }
    if (o?.ogolId && !clube.ogolId) { dados.ogolId = String(o.ogolId); contagem.ogol += 1 }

    if (!clube.corPrimaria) {
      const curada = paletaCurada(clube.nome, clube.apelido)
      if (curada) {
        dados.corPrimaria = curada.primary
        dados.corSecundaria = curada.secondary ?? null
        dados.corAcento = curada.accents?.[0] ?? null
        dados.coresFonte = 'design:CLUBE_PALETAS'
        contagem.coresCuradas += 1
      } else if (c) {
        dados.corPrimaria = c.primary
        dados.corSecundaria = c.secondary
        dados.corAcento = c.accent
        dados.coresFonte = 'escudo:cloudinary'
        contagem.coresEscudo += 1
      }
    }

    if (CORRIGIR_CIDADES && !cidadeValida(clube.cidade, clube.estado)) {
      const candidatas = [w?.cidade, o?.cidade?.split(',')[0]?.trim()]
        .filter(Boolean)
        .filter((cid) => cidadeValida(cid, clube.estado))
      const distintas = [...new Set(candidatas.map(normalizeNome))]
      if (distintas.length === 1) {
        dados.cidade = candidatas[0]
        contagem.cidadeCorrigida += 1
      } else if (candidatas.length > 0) {
        cidadesParaRevisar.push(
          `${clube.nome}/${clube.estado}: atual "${clube.cidade ?? ''}" → ${candidatas.join(' ou ')}`,
        )
      } else {
        cidadesParaRevisar.push(
          `${clube.nome}/${clube.estado}: atual "${clube.cidade ?? ''}" → sem sugestão nas fontes`,
        )
      }
    }

    if (Object.keys(dados).length === 0) continue
    if (!DRY_RUN) await db.afiliacao.update({ where: { id: clube.id }, data: dados })
  }

  console.log('\nFicha do clube preenchida:')
  for (const [campo, total] of Object.entries(contagem)) {
    console.log(`  ${campo.padEnd(16)} ${total}`)
  }
  if (!CORRIGIR_CIDADES) {
    console.log('\n(cidade não tocada — rode com --corrigir-cidades para corrigir as inválidas)')
  } else if (cidadesParaRevisar.length > 0) {
    console.log(`\n⚠ ${cidadesParaRevisar.length} cidades exigem decisão humana:`)
    for (const linha of cidadesParaRevisar) console.log(`   ${linha}`)
  }

  if (reancorados.length > 0) {
    const acao = CORRIGIR_FICHA ? 'reancorados' : 'ancorados no QID errado'
    console.log(`\n⚠ ${reancorados.length} clubes ${acao}:`)
    for (const linha of reancorados) console.log(`   ${linha}`)
    if (!CORRIGIR_FICHA) {
      console.log('   → rode com --corrigir-ficha para reescrever a ficha desses clubes')
    }
  }
  if (ambiguos.length > 0) {
    console.log(`\n⚠ ${ambiguos.length} clubes SEM ficha do Wikidata por homônimo não resolvido:`)
    for (const linha of ambiguos) console.log(`   ${linha}`)
    console.log('   → escolha o QID em src/data/clubes-correcoes-curadas.json (bloco "wikidata")')
  }
  if (DRY_RUN) console.log('\n(dry-run — nada gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
