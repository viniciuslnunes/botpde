/**
 * Casamento Afiliacao ↔ TheSportsDB para seed de escudos (Fase D).
 * Puro (sem rede) — testável via `scripts/test-afiliacoes.js`.
 */
import {
  chaveGrupoClube,
  chaveMatch,
  casarClube,
  saoMesmoClube,
  LIGAS,
  indexarLiga,
} from './afiliacoes-normalize.js'
import { CHAVES_HOMONIMAS } from './escudos-wiki-match.js'

export { LIGAS, indexarLiga }

/** @typedef {{ nome: string, badge: string | null, serie: string, location: string | null, idTeam: string | null, fonte: 'indice' | 'busca' }} MatchApi */

/**
 * Casa afiliacao com o índice das 4 ligas brasileiras.
 * @param {{ nome: string, apelido?: string | null, estado: string | null }} afiliacao
 * @param {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>} indice
 * @returns {MatchApi | null}
 */
export function casarAfiliacaoIndice(afiliacao, indice) {
  const match = casarClube(afiliacao, indice)
  if (!match?.badge) return null
  return {
    nome: match.nome,
    badge: match.badge,
    serie: match.serie,
    location: match.location,
    idTeam: null,
    fonte: 'indice',
  }
}

/**
 * @param {string} location
 * @param {string | null} uf
 * @returns {boolean}
 */
export function localizacaoCompativel(location, uf) {
  if (!uf || !location) return true
  const loc = location.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const ufNorm = uf.toLowerCase()
  const ESTADOS = {
    ac: ['acre'],
    al: ['alagoas'],
    am: ['amazonas'],
    ap: ['amapa'],
    ba: ['bahia'],
    ce: ['ceara'],
    df: ['distrito federal', 'brasilia'],
    es: ['espirito santo'],
    go: ['goias'],
    ma: ['maranhao'],
    mg: ['minas gerais'],
    ms: ['mato grosso do sul'],
    mt: ['mato grosso'],
    pa: ['para'],
    pb: ['paraiba'],
    pe: ['pernambuco'],
    pi: ['piaui'],
    pr: ['parana'],
    rj: ['rio de janeiro'],
    rn: ['rio grande do norte'],
    ro: ['rondonia'],
    rr: ['roraima'],
    rs: ['rio grande do sul'],
    sc: ['santa catarina'],
    se: ['sergipe'],
    sp: ['sao paulo'],
    to: ['tocantins'],
  }
  const nomes = ESTADOS[ufNorm]
  if (!nomes) return true
  return nomes.some((n) => loc.includes(n))
}

/**
 * Casa resultado de searchteams.php com validação estrita.
 * @param {{ nome: string, apelido?: string | null, estado: string | null }} afiliacao
 * @param {Array<{ idTeam?: string, strTeam?: string, strTeamBadge?: string, strLocation?: string, strCountry?: string }>} teams
 * @returns {MatchApi | null}
 */
export function casarAfiliacaoBusca(afiliacao, teams) {
  if (!Array.isArray(teams)) return null

  const grupoA = chaveGrupoClube(afiliacao.nome, afiliacao.estado)
  /** @type {MatchApi | null} */
  let melhor = null

  for (const t of teams) {
    if (!t?.strTeam || !t.strTeamBadge) continue
    if (t.strCountry && t.strCountry !== 'Brazil') continue

    const refApi = { nome: t.strTeam, estado: afiliacao.estado }
    const grupoT = chaveGrupoClube(t.strTeam, afiliacao.estado)
    const chaveIgual = chaveMatch(t.strTeam) === chaveMatch(afiliacao.nome)
    const mesmo = saoMesmoClube(afiliacao, refApi)
    const grupoIgual = grupoA === grupoT
    const kw = chaveMatch(afiliacao.nome)
    const homonimo = CHAVES_HOMONIMAS.has(kw) || CHAVES_HOMONIMAS.has(kw.split(' ')[0] ?? '')

    if (!mesmo && !grupoIgual && !(chaveIgual && !homonimo)) continue
    if (!localizacaoCompativel(t.strLocation ?? '', afiliacao.estado)) continue

    const candidato = {
      nome: t.strTeam,
      badge: t.strTeamBadge,
      serie: '',
      location: t.strLocation ?? null,
      idTeam: t.idTeam ?? null,
      fonte: 'busca',
    }

    if (grupoIgual || mesmo) return candidato
    if (!melhor) melhor = candidato
  }

  return melhor
}

/**
 * Monta termos de busca (do mais específico ao mais curto).
 * @param {{ nome: string, apelido?: string | null }} afiliacao
 * @returns {string[]}
 */
export function termosBuscaApi(afiliacao) {
  /** @type {string[]} */
  const termos = []
  if (afiliacao.apelido?.trim()) termos.push(afiliacao.apelido.trim())
  termos.push(afiliacao.nome.trim())
  const curto = afiliacao.nome.split(/\s+/).slice(0, 3).join(' ')
  if (curto !== afiliacao.nome.trim()) termos.push(curto)
  return [...new Set(termos)]
}
