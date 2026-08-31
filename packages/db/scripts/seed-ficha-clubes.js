/**
 * Preenche a FICHA do clube em `Afiliacao` a partir dos datasets offline:
 * ano de fundação, estádio (nome, capacidade, coordenada), site oficial,
 * cores e ids externos (Wikidata QID, Ogol).
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes -- --dry-run
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-cidades
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
 * Nada aqui é irreversível: todos os campos são aditivos e o script só escreve
 * o que está vazio, exceto cidade sob a flag acima.
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
} from './lib/catalogo-clubes.js'

prepareSeedEnv({ scriptLabel: 'seed:ficha-clubes' })

const DRY_RUN = process.argv.includes('--dry-run')
const CORRIGIR_CIDADES = process.argv.includes('--corrigir-cidades')
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
  const wikidata = lerDataset('wikidata-clubes-br.json')
  const ogolBruto = lerDataset('ogol-clubes-brasil.json')
  const cores = lerDataset('cores-escudos.json')
  const { valida: cidadeValida } = validadorCidade(carregarMunicipios())

  const afiliacoes = await db.afiliacao.findMany({
    select: {
      id: true, nome: true, apelido: true, estado: true, cidade: true,
      fundacaoAno: true, estadio: true, estadioCapacidade: true, estadioLat: true,
      estadioLng: true, siteOficial: true, corPrimaria: true, coresFonte: true,
      wikidataQid: true, ogolId: true,
    },
  })

  // Índices das fontes por UF (a UF do Wikidata sai da cidade, via IBGE).
  const municipios = carregarMunicipios()
  const ufsPorCidade = new Map()
  for (const [uf, lista] of Object.entries(municipios)) {
    for (const nome of lista) {
      const k = normalizeNome(nome)
      if (!ufsPorCidade.has(k)) ufsPorCidade.set(k, new Set())
      ufsPorCidade.get(k).add(uf)
    }
  }
  /** @type {Map<string, object>} */
  const idxWikidata = new Map()
  for (const w of wikidata.clubes ?? []) {
    for (const uf of ufsPorCidade.get(normalizeNome(w.cidade ?? '')) ?? []) {
      const chave = chaveIndice(w.nome, uf)
      if (!idxWikidata.has(chave)) idxWikidata.set(chave, w)
    }
  }
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
  }
  const cidadesParaRevisar = []

  for (const clube of afiliacoes) {
    const chave = chaveIndice(clube.nome, clube.estado)
    const w = idxWikidata.get(chave)
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
  if (DRY_RUN) console.log('\n(dry-run — nada gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
