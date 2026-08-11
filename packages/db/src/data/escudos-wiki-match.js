/**
 * Casamento Afiliacao ↔ Soccer Wiki para seed de escudos.
 * Puro (sem rede/Prisma) — testável via `scripts/test-afiliacoes.js`.
 */
import {
  normalizeNome,
  normalizeNomeSemUf,
  chaveMatch,
  chaveGrupoClube,
  saoMesmoClube,
  inferirUfDoNome,
  cidadesCompativeis,
} from './afiliacoes-normalize.js'

/** Aliases: nome normalizado no Soccer Wiki → chave curta de casamento. */
export const WIKI_ALIASES = {
  'cr flamengo': 'flamengo',
  'regatas flamengo': 'flamengo',
  'clube de regatas flamengo': 'flamengo',
  'botafogo fr': 'botafogo',
  'botafogo de futebol e regatas': 'botafogo',
  'sc internacional': 'internacional',
  'sport club internacional': 'internacional',
  'gremio foot ball porto alegrense': 'gremio',
  'rb bragantino': 'bragantino',
  'red bull bragantino': 'bragantino',
  'ec bahia': 'bahia',
  'ec vitoria': 'vitoria',
  'cruzeiro ec': 'cruzeiro',
  'atletico mineiro': 'atletico mineiro',
  'athletico paranaense': 'athletico paranaense',
  'clube atletico paranaense': 'athletico paranaense',
  'clube do remo': 'remo',
  'america mineiro': 'america mineiro',
  'america de natal': 'america de natal',
  'ceara sc': 'ceara',
  'fortaleza ec': 'fortaleza',
  'cuiaba ec': 'cuiaba',
  'guarani fc': 'guarani',
  'avai fc': 'avai',
  'santos fc': 'santos',
  'mirassol fc': 'mirassol',
  'sport recife': 'sport',
  'clube de regatas brasil': 'brasil',
  'ponte preta': 'ponte preta',
  'atletico goianiense': 'atletico goianiense',
  'gremio novorizontino': 'novorizontino',
  'londrina ec': 'londrina',
  'botafogo pb': 'botafogo',
  'botafogo sp': 'botafogo',
  'operario ferroviario ec': 'operario',
  'joinville ec': 'joinville',
  'criciuma ec': 'criciuma',
  'chapecoense af': 'chapecoense',
  'figueirense': 'figueirense',
  'paysandu sc': 'paysandu',
  'parana clube': 'parana',
  'sao bernardo fc': 'sao bernardo',
  'vasco da gama': 'vasco da gama',
  'club de regatas vasco da gama': 'vasco da gama',
  'sociedade esportiva palmeiras': 'palmeiras',
  'ec juventude': 'juventude',
  'csa': 'csa',
  'centro sportivo alagoano': 'csa',
  'confianca': 'confianca',
  'anapolina': 'anapolina',
  'ferroviario': 'ferroviario',
  'ferroviario ec': 'ferroviario',
  'asa': 'asa',
  'asa fc': 'asa',
  'agremiacao sportiva arapiraquense': 'asa',
  'icasa': 'icasa',
  'ad cabofriense': 'cabofriense',
  'cabofriense': 'cabofriense',
  'club sportivo sergipe': 'sergipe',
  'ad confianca': 'confianca',
  'associacao desportiva confianca': 'confianca',
  'portuguesa': 'portuguesa',
  'associacao atletica portuguesa': 'portuguesa',
  'itabaiana': 'itabaiana',
  'associacao olimpica de itabaiana': 'itabaiana',
  'guarany de sobral': 'guarany de sobral',
  'guarany sporting club de sobral': 'guarany de sobral',
  'operario fc': 'operario',
  'sergipe': 'sergipe',
  'petrolina ec': 'petrolina',
  'tuna luso': 'tuna luso',
  'imperatriz': 'imperatriz',
  'sao cristovao': 'sao cristovao',
}

/**
 * UF explícita para nomes do Wiki sem sufixo de estado (homônimos nacionais).
 * Chave: `normalizeNome(nome no Wiki)`.
 */
export const WIKI_UF_POR_NOME = {
  'botafogo fr': 'RJ',
  'botafogo de futebol e regatas': 'RJ',
  'ec vitoria': 'BA',
  'sport recife': 'PE',
  'nautico': 'PE',
  'gremio': 'RS',
  'gremio foot ball porto alegrense': 'RS',
  'sc internacional': 'RS',
  'sport club internacional': 'RS',
  'ceara sc': 'CE',
  'cr flamengo': 'RJ',
  'clube de regatas flamengo': 'RJ',
  'clube de regatas brasil': 'AL',
  'atletico mineiro': 'MG',
  'atletico goianiense': 'GO',
  'athletico paranaense': 'PR',
  'clube atletico paranaense': 'PR',
  'vasco da gama': 'RJ',
  'club de regatas vasco da gama': 'RJ',
  'fluminense': 'RJ',
  'palmeiras': 'SP',
  'sociedade esportiva palmeiras': 'SP',
  'santos fc': 'SP',
  'corinthians': 'SP',
  'sao paulo': 'SP',
  'sao paulo fc': 'SP',
  'juventude': 'RS',
  'ec juventude': 'RS',
  'paysandu sc': 'PA',
  'operario ferroviario ec': 'PR',
  'csa': 'AL',
  'centro sportivo alagoano': 'AL',
  'confianca': 'SE',
  'anapolina': 'GO',
  'ferroviario': 'CE',
  'ferroviario ec': 'CE',
  'ferroviario ac': 'CE',
  'bangu ac': 'RJ',
  'cameta sc': 'PA',
  'central sc': 'PE',
  'friburguense ac': 'RJ',
  'maranhao ac': 'MA',
  'olaria ac': 'RJ',
  'salgueiro ac': 'PE',
  'sao jose ec': 'SP',
  'sao raimundo ec': 'PA',
  'serrano sc': 'BA',
  'tupi fc': 'SP',
  'villa nova ac': 'MG',
  'river ac': 'PI',
  'asa': 'AL',
  'asa fc': 'AL',
  'agremiacao sportiva arapiraquense': 'AL',
  'icasa': 'CE',
  'cabofriense': 'RJ',
  'ad cabofriense': 'RJ',
  'club sportivo sergipe': 'SE',
  'sergipe': 'SE',
  'ad confianca': 'SE',
  'associacao desportiva confianca': 'SE',
  'portuguesa': 'SP',
  'associacao atletica portuguesa': 'SP',
  'itabaiana': 'SE',
  'associacao olimpica de itabaiana': 'SE',
  'guarany de sobral': 'CE',
  'operario fc': 'PR',
  'petrolina ec': 'PE',
  'tuna luso': 'PA',
  'imperatriz': 'MA',
  'sao cristovao': 'RJ',
  'potiguar': 'RN',
}

/** Nomes que existem em vários estados — exige UF explícita no wiki. */
export const CHAVES_HOMONIMAS = new Set([
  'america', 'operario', 'botafogo', 'vitoria', 'atletico', 'gremio', 'sport',
  'paulista', 'portuguesa', 'internacional', 'nautico', 'juventude',
  'guarani', 'santa cruz', 'rio branco', 'central', 'palmeiras', 'comercial',
])

/** @param {string} nome */
function chaveAliasLookup(nome) {
  const semUf = normalizeNomeSemUf(nome)
  return WIKI_ALIASES[semUf] ?? WIKI_ALIASES[normalizeNome(nome)] ?? null
}

/** @param {string} nome */
export function chaveWiki(nome) {
  const alias = chaveAliasLookup(nome)
  return alias ? chaveMatch(alias) : chaveMatch(nome)
}

/**
 * @param {string} nome
 * @returns {string | null}
 */
export function inferirUfWiki(nome) {
  const semUf = normalizeNomeSemUf(nome)
  const fixa = WIKI_UF_POR_NOME[semUf] ?? WIKI_UF_POR_NOME[normalizeNome(nome)]
  if (fixa) return fixa
  return inferirUfDoNome(nome)
}

/**
 * Nome canônico para `saoMesmoClube` (lado Wiki).
 * @param {string} nome
 * @returns {string}
 */
export function nomeCanonicoWiki(nome) {
  return chaveAliasLookup(nome) ?? nome
}

/**
 * @param {{ nome: string, cidade?: string|null }} wiki
 * @param {{ nome: string, estado: string|null, cidade?: string|null }} afiliacao
 * @returns {number} 0 = sem match; maior = melhor
 */
export function scoreWikiAfiliacao(wiki, afiliacao) {
  const ufWiki = inferirUfWiki(wiki.nome)
  const ufAf = afiliacao.estado?.toUpperCase() ?? null

  if (ufWiki && ufAf && ufWiki !== ufAf) return 0
  if (!cidadesCompativeis(wiki.cidade, afiliacao.cidade)) return 0

  const refWiki = { nome: nomeCanonicoWiki(wiki.nome), estado: ufWiki ?? ufAf }
  if (ufWiki && ufAf && saoMesmoClube(refWiki, afiliacao)) return 100

  const kw = chaveWiki(wiki.nome)
  const ka = chaveMatch(afiliacao.nome)
  const grupoA = chaveGrupoClube(afiliacao.nome, afiliacao.estado)
  const ufGrupo = ufWiki ?? ufAf ?? ''
  const grupoW = `${kw}|${normalizeNome(ufGrupo)}`

  if (ufWiki && ufAf && grupoA === grupoW) return 95
  if (kw === ka) {
    const homonimo = CHAVES_HOMONIMAS.has(kw) || CHAVES_HOMONIMAS.has(kw.split(' ')[0] ?? '')
    if (homonimo && (!ufWiki || !ufAf || ufWiki !== ufAf)) return 0
    if (!ufWiki || !ufAf || ufWiki !== ufAf) return 0
    return 90
  }

  return 0
}
