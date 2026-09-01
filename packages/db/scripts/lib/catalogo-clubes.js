/**
 * Utilidades compartilhadas pelos seeds e pela auditoria do CATÁLOGO DE CLUBES.
 *
 * Regra central: clube externo casa com `Afiliacao` por
 * `chaveCanonicaClube(nome, uf)` + UF. Homônimo dentro da mesma UF (Bahia x
 * Bahia de Feira, Democrata GV x Democrata SL) NÃO é resolvido por essa chave —
 * por isso `indexarClubes` devolve as colisões em vez de escondê-las: quem
 * escreve no banco decide o que fazer, e o padrão é pular.
 *
 * Ver docs/data/auditoria-catalogo-clubes.md §5.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chaveCanonicaClube, normalizeNome } from '../../src/data/afiliacoes-normalize.js'
import { MONOREPO_ROOT } from './cloudinary-admin.js'

export { chaveCanonicaClube }

/**
 * Malha municipal do IBGE já versionada no app web. Script de seed pode ler
 * arquivo de outro pacote (não é código de runtime); o app continua sendo o
 * dono do dado — atualização por `pnpm --filter @torcida/web municipios:atualizar`.
 * @returns {Record<string, string[]>}
 */
export function carregarMunicipios() {
  const caminho = resolve(MONOREPO_ROOT, 'apps/web/src/lib/data/municipios-brasil.json')
  return JSON.parse(readFileSync(caminho, 'utf8'))
}

/**
 * DF é o caso especial: só existe o município de Brasília, mas Gama, Ceilândia,
 * Sobradinho e Taguatinga são regiões administrativas usadas como cidade por
 * clube e por torcida. Aceitas de propósito — não são erro de cadastro.
 */
const REGIOES_ADMINISTRATIVAS_DF = new Set([
  'gama',
  'ceilandia',
  'sobradinho',
  'taguatinga',
  'planaltina',
  'samambaia',
  'santa maria',
  'sao sebastiao',
  'brazlandia',
  'paranoa',
  'recanto das emas',
  'riacho fundo',
  'guara',
  'nucleo bandeirante',
  'cruzeiro',
  'candangolandia',
])

/**
 * @param {Record<string, string[]>} municipios
 * @returns {{ valida: (cidade: string | null | undefined, uf: string | null | undefined) => boolean, ufsDaCidade: (cidade: string) => string[] }}
 */
export function validadorCidade(municipios) {
  /** @type {Map<string, Set<string>>} */
  const porUf = new Map()
  /** @type {Map<string, Set<string>>} */
  const ufsPorCidade = new Map()
  for (const [uf, lista] of Object.entries(municipios)) {
    porUf.set(uf, new Set(lista.map(normalizeNome)))
    for (const nome of lista) {
      const k = normalizeNome(nome)
      if (!ufsPorCidade.has(k)) ufsPorCidade.set(k, new Set())
      ufsPorCidade.get(k).add(uf)
    }
  }
  return {
    valida(cidade, uf) {
      const k = normalizeNome(cidade ?? '')
      if (!k || !uf) return false
      if (uf === 'DF' && REGIOES_ADMINISTRATIVAS_DF.has(k)) return true
      return porUf.get(uf)?.has(k) ?? false
    },
    ufsDaCidade(cidade) {
      return [...(ufsPorCidade.get(normalizeNome(cidade ?? '')) ?? [])]
    },
  }
}

/**
 * Índice `chaveCanonica|uf` → clube, com as colisões separadas.
 *
 * @template {{ nome: string, estado?: string | null, uf?: string | null }} T
 * @param {T[]} clubes
 * @returns {{ indice: Map<string, T>, colisoes: Map<string, T[]> }}
 */
export function indexarClubes(clubes) {
  /** @type {Map<string, T[]>} */
  const agrupado = new Map()
  for (const clube of clubes) {
    const uf = (clube.estado ?? clube.uf ?? '').toUpperCase()
    const chave = `${chaveCanonicaClube(clube.nome, uf)}|${uf}`
    if (!agrupado.has(chave)) agrupado.set(chave, [])
    agrupado.get(chave).push(clube)
  }
  /** @type {Map<string, T>} */
  const indice = new Map()
  /** @type {Map<string, T[]>} */
  const colisoes = new Map()
  for (const [chave, lista] of agrupado) {
    if (lista.length === 1) indice.set(chave, lista[0])
    else colisoes.set(chave, lista)
  }
  return { indice, colisoes }
}

/**
 * @param {string} nome
 * @param {string | null | undefined} uf
 * @returns {string}
 */
export function chaveIndice(nome, uf) {
  return `${chaveCanonicaClube(nome, uf)}|${String(uf ?? '').toUpperCase()}`
}

/**
 * Tokens genéricos do futebol BR — não distinguem clube nenhum.
 * `atletico` fica de fora da lista de propósito (Atlético-MG x Atlético-GO já
 * são separados pela UF, e "Atlético" sozinho é o nome usado pela CBF).
 */
const TOKENS_GENERICOS = new Set([
  'futebol', 'clube', 'esporte', 'esportivo', 'esportiva', 'sport', 'club',
  'associacao', 'sociedade', 'de', 'do', 'da', 'dos', 'das', 'e', 'fc', 'ec',
  'ac', 'sc', 'regatas', 'recreativo', 'recreativa', 'atletica', 'desportiva',
  'desportivo', 'gremio', 'uniao',
])

/**
 * @param {string} nome
 * @returns {Set<string>}
 */
function tokensSignificativos(nome) {
  return new Set(
    normalizeNome(nome)
      .split(' ')
      .filter((t) => t.length > 1 && !TOKENS_GENERICOS.has(t)),
  )
}

/**
 * Casamento por similaridade DENTRO da mesma UF, para quando a chave canônica
 * não bate ("Marília" x "Marilia Atlético Clube"). Devolve o melhor candidato e
 * o score — cabe a quem chama decidir o corte. O seed usa 0.8 para aceitar e
 * 0.45 para mandar revisar em vez de criar duplicata.
 *
 * @template {{ nome: string }} T
 * @param {string} nome
 * @param {T[]} candidatos clubes da MESMA UF
 * @returns {{ clube: T | null, score: number }}
 */
export function melhorCandidato(nome, candidatos) {
  const alvo = tokensSignificativos(nome)
  if (alvo.size === 0) return { clube: null, score: 0 }
  let melhor = null
  let melhorScore = 0
  for (const candidato of candidatos) {
    const tokens = tokensSignificativos(candidato.nome)
    if (tokens.size === 0) continue
    const intersecao = [...alvo].filter((t) => tokens.has(t)).length
    if (intersecao === 0) continue
    const uniao = new Set([...alvo, ...tokens]).size
    const jaccard = intersecao / uniao
    // Contido: "Marília" ⊂ "Marilia Atlético Clube" — todos os tokens
    // distintivos de um lado aparecem no outro.
    const contido = intersecao === alvo.size || intersecao === tokens.size
    const score = contido ? Math.max(jaccard, 0.85) : jaccard
    if (score > melhorScore) {
      melhorScore = score
      melhor = candidato
    }
  }
  return { clube: melhor, score: melhorScore }
}

/**
 * @template {{ nome: string, estado?: string | null, uf?: string | null }} T
 * @param {T[]} clubes
 * @returns {Map<string, T[]>}
 */
export function agruparPorUf(clubes) {
  /** @type {Map<string, T[]>} */
  const porUf = new Map()
  for (const clube of clubes) {
    const uf = String(clube.estado ?? clube.uf ?? '').toUpperCase()
    if (!porUf.has(uf)) porUf.set(uf, [])
    porUf.get(uf).push(clube)
  }
  return porUf
}

/**
 * Lê um JSON de `packages/db/src/data`.
 * @param {string} arquivo
 * @returns {unknown}
 */
export function lerDataset(arquivo) {
  return JSON.parse(readFileSync(resolve(MONOREPO_ROOT, 'packages/db/src/data', arquivo), 'utf8'))
}

// ── Wikidata: qual entidade é o clube ─────────────────────────────────────

/**
 * P31 que NÃO é o time principal masculino do clube. O Wikidata modela cada
 * um desses como entidade separada, com o MESMO rótulo do clube — é a origem do
 * achado de 2026-09-01 (a ficha do Corinthians era a do time feminino).
 */
const TIPOS_NAO_PRINCIPAIS = new Set([
  'Q51481377', // women's association football club
  'Q28140340', // equipa de futebol feminino
  'Q116953048', // beach soccer club
  'Q98767736', // fictional sports club
])
// Só entram aqui os P31 que marcam uma entidade SEPARADA do time principal.
// "clube de remo" (Q7372078) e "rugby union club" (Q43009164) não servem: o
// Sportivo Sergipe é um clube de futebol que TAMBÉM rema, e a mesma entidade
// carrega os dois tipos — excluí-la apagaria a ficha do clube certo.

/**
 * O que o P31 não tipa, a descrição livre quase sempre diz. Casa na DESCRIÇÃO,
 * nunca no nome do clube — "Clube do Remo" e "Sport Club Corinthians Paulista"
 * são nomes legítimos do time principal.
 */
const DESCRICAO_NAO_PRINCIPAL =
  /(feminin|women|futsal|beach soccer|futebol de areia|sub[\s-]?\d|juvenil|youth|reserve team|e[\s-]?sports|fictional|rugby|voleibol|basquete)/i

/** @param {{ tipos?: string[], descricao?: string | null }} w */
function ehTimePrincipal(w) {
  if ((w.tipos ?? []).some((t) => TIPOS_NAO_PRINCIPAIS.has(t))) return false
  return !(w.descricao && DESCRICAO_NAO_PRINCIPAL.test(w.descricao))
}

/**
 * Aplica um filtro só quando ele DESEMPATA: se sobrar zero, o filtro não sabia
 * nada de útil sobre esses candidatos e a lista original continua valendo.
 * @template T
 * @param {T[]} lista
 * @param {(item: T) => boolean} filtro
 * @returns {T[]}
 */
function afunilar(lista, filtro) {
  const filtrada = lista.filter(filtro)
  return filtrada.length > 0 ? filtrada : lista
}

/**
 * Resolvedor `Afiliacao` → entidade do Wikidata.
 *
 * Existe porque nome+UF NÃO é chave (ver topo do arquivo) e o índice ingênuo
 * escolhia o primeiro homônimo do arquivo — foi assim que a ficha do Corinthians
 * virou a do time feminino (fundação 1997, Estádio Alfredo Schürig) e a do
 * Flamengo virou a do time feminino na Gávea. A regra aqui é: **desempatar só
 * com evidência do próprio dataset e, sem evidência, não escolher.**
 *
 * Ordem: curadoria explícita → candidato único → modalidade (P31/descrição:
 * feminino, futsal, beach…) → clube ativo (P576 = extinto perde para o
 * sucessor) → mesma cidade da `Afiliacao`. Sem desempate, devolve
 * `motivo: 'ambiguo'` com os candidatos, para virar relatório em vez de palpite.
 *
 * @param {{ clubes: Array<Record<string, any>> }} dataset `wikidata-clubes-br.json`
 * @param {{ ufsDaCidade: (cidade: string) => string[] }} cidades `validadorCidade(...)`
 * @param {Map<string, string>} [curados] chave `chaveIndice(nome, uf)` ou `nome|uf` → QID
 */
export function criarResolvedorWikidata(dataset, cidades, curados = new Map()) {
  const porQid = new Map((dataset.clubes ?? []).map((w) => [w.qid, w]))
  /** @type {Map<string, Array<Record<string, any>>>} */
  const porChave = new Map()
  for (const w of dataset.clubes ?? []) {
    // A UF do Wikidata sai da cidade da sede, via malha do IBGE.
    for (const uf of cidades.ufsDaCidade(w.cidade ?? '')) {
      const chave = chaveIndice(w.nome, uf)
      if (!porChave.has(chave)) porChave.set(chave, [])
      const lista = porChave.get(chave)
      if (!lista.some((x) => x.qid === w.qid)) lista.push(w)
    }
  }

  /**
   * @param {{ nome: string, estado?: string | null, cidade?: string | null }} afiliacao
   * @returns {{ clube: Record<string, any> | null, motivo: string, candidatos: Array<Record<string, any>> }}
   */
  function resolver(afiliacao) {
    const uf = String(afiliacao.estado ?? '').toUpperCase()
    const qidCurado =
      curados.get(`${afiliacao.nome.toLowerCase()}|${uf}`) ??
      curados.get(chaveIndice(afiliacao.nome, uf))
    if (qidCurado) {
      const clube = porQid.get(qidCurado) ?? null
      return { clube, motivo: clube ? 'curado' : 'curado-qid-ausente', candidatos: [] }
    }

    const candidatos = porChave.get(chaveIndice(afiliacao.nome, uf)) ?? []
    if (candidatos.length === 0) return { clube: null, motivo: 'sem-fonte', candidatos }

    // Modalidade é filtro DURO, não desempate: entidade de time feminino, futsal
    // ou beach soccer não é ficha do clube masculino nem quando é a única
    // candidata — foi o caso do América-MG, cujo único casamento por nome era o
    // verbete do time feminino (2015, sem estádio).
    let lista = candidatos.filter(ehTimePrincipal)
    if (lista.length === 0) return { clube: null, motivo: 'so-outra-modalidade', candidatos }
    if (lista.length === 1) {
      return { clube: lista[0], motivo: candidatos.length === 1 ? 'unico' : 'modalidade', candidatos }
    }

    lista = afunilar(lista, (w) => !w.dissolucao)
    if (lista.length === 1) return { clube: lista[0], motivo: 'ativo', candidatos }

    const cidadeAfiliacao = normalizeNome(afiliacao.cidade ?? '')
    if (cidadeAfiliacao) {
      lista = afunilar(lista, (w) => normalizeNome(w.cidade ?? '') === cidadeAfiliacao)
      if (lista.length === 1) return { clube: lista[0], motivo: 'cidade', candidatos }
    }

    return { clube: null, motivo: 'ambiguo', candidatos: lista }
  }

  return { resolver, porQid }
}

/**
 * Lê a curadoria de QID de `clubes-correcoes-curadas.json` (`wikidata[]`) como
 * mapa aceito por `criarResolvedorWikidata`.
 * @param {{ wikidata?: Array<{ alvo: { nome: string, uf: string }, qid: string }> }} dataset
 * @returns {Map<string, string>}
 */
export function lerCuradoriaWikidata(dataset) {
  /** @type {Map<string, string>} */
  const mapa = new Map()
  for (const item of dataset.wikidata ?? []) {
    const uf = String(item.alvo.uf ?? '').toUpperCase()
    mapa.set(`${item.alvo.nome.toLowerCase()}|${uf}`, item.qid)
    mapa.set(chaveIndice(item.alvo.nome, uf), item.qid)
  }
  return mapa
}

// ── Torcidas: fundação e casamento de nome ─────────────────────────────────

/**
 * `"23/10/1992"`, `"**\/**\/2006"`, `"1969"` → ano. Descarta o implausível: a
 * primeira torcida uniformizada do Brasil é de 1939.
 * @param {string | null | undefined} valor
 * @returns {number | null}
 */
export function anoFundacaoTorcida(valor) {
  const anos = String(valor ?? '').match(/\b(19|20)\d{2}\b/g)
  if (!anos) return null
  const ano = Number(anos[anos.length - 1])
  return ano >= 1930 && ano <= new Date().getFullYear() ? ano : null
}

/**
 * Nome comparável de torcida: sem prefixo administrativo, sem acento, sem
 * espaço e com número por extenso — "Torcida Pavilhão 9" bate com
 * "PAVILHÃO NOVE"; "Mancha Alvi-Verde" bate com "Mancha AlviVerde".
 * @param {string} nome
 * @returns {string}
 */
export function chaveTorcida(nome) {
  const NUMEROS = { 1: 'um', 9: 'nove', 10: 'dez', 12: 'doze', 13: 'treze', 33: 'trintaetres' }
  return normalizeNome(nome)
    .replace(/\b(torcida|torcidas|organizada|organizado|uniformizada|associacao|movimento|grupo|oficial)\b/g, ' ')
    .replace(/\d+/g, (d) => NUMEROS[Number(d)] ?? d)
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Distância de edição — a lista oficial tem erro de digitação ("Gladiaores") e o
 * catálogo colaborativo tem variação de grafia. Sem isso, importar as ausentes
 * criaria duplicata do que já existe.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function distanciaEdicao(a, b) {
  const m = a.length
  const n = b.length
  if (!m || !n) return Math.max(m, n)
  let anterior = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i += 1) {
    const atual = [i]
    for (let j = 1; j <= n; j += 1) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    anterior = atual
  }
  return anterior[n]
}

/**
 * Similaridade por trigrama (0–1) entre duas chaves já normalizadas.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similaridadeTrigrama(a, b) {
  const trigramas = (s) => {
    const p = `  ${s} `
    const g = new Set()
    for (let i = 0; i < p.length - 2; i += 1) g.add(p.slice(i, i + 3))
    return g
  }
  const A = trigramas(a)
  const B = trigramas(b)
  const inter = [...A].filter((x) => B.has(x)).length
  return inter / new Set([...A, ...B]).size
}
