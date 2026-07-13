/**
 * Lógica pura (offline, testável) do seed de Afiliacao:
 * normalização de nomes, geração de slug único e casamento
 * clube-do-diretório ↔ time-da-API (TheSportsDB).
 *
 * Nenhuma dependência de rede ou de Prisma aqui — de propósito, para
 * poder ser testada sem sandbox (ver `scripts/test-afiliacoes.js`).
 */

/** Ligas brasileiras na TheSportsDB → série do enum SerieCampeonato. */
export const LIGAS = [
  { liga: 'Brazilian_Serie_A', serie: 'A' },
  { liga: 'Brazilian_Serie_B', serie: 'B' },
  { liga: 'Brazilian_Serie_C', serie: 'C' },
  { liga: 'Brazilian_Serie_D', serie: 'D' },
]

/**
 * Aliases: `normalizeNome(nome do diretório)` → nome como aparece na API.
 * Chave PRESERVA a UF (ex.: 'atletico mg' vs 'atletico go') porque a
 * `chaveMatch` colapsaria ambos em 'atletico'. Valor passa por `chaveMatch`
 * no lookup do índice. Só entram casos em que a normalização direta não casa.
 */
export const ALIASES = {
  'athletico pr': 'athletico paranaense',
  'atletico mg': 'atletico mineiro',
  'atletico go': 'atletico goianiense',
  'america mg': 'america mineiro',
  'america rn': 'america de natal',
  'bragantino': 'red bull bragantino',
  'vasco': 'vasco da gama',
  // Nomes completos do catálogo organizadasbrasil.com → nome curto do diretório
  'sport club corinthians paulista': 'corinthians',
  'sport club internacional': 'internacional',
  'botafogo de futebol e regatas': 'botafogo',
  'red bull bragantino': 'bragantino',
  'sao paulo futebol clube': 'sao paulo',
  'clube de regatas do flamengo': 'flamengo',
  'fluminense football club': 'fluminense',
}

const SUFIXOS_UF = new Set([
  'ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa','pb',
  'pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to',
])

const PALAVRAS_RUIDO = new Set([
  'fc','ec','cf','ac','sc','fbc','afc','clube','club','futebol','esporte',
  'esportivo','esportiva','de','da','do','das','dos','e','associacao',
  'atletico', // NÃO: atletico é distintivo; removido da lista abaixo
])
// `atletico` é distintivo (Atlético-MG/GO/PR) — não deve ser ruído.
PALAVRAS_RUIDO.delete('atletico')

/**
 * Remove acentos, baixa a caixa, tira pontuação e colapsa espaços.
 * @param {string} nome
 * @returns {string}
 */
export function normalizeNome(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // pontuação → espaço
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Chave de casamento: normaliza e remove sufixos de UF e palavras de ruído
 * (FC, EC, "de", "clube"…), preservando tokens distintivos.
 * @param {string} nome
 * @returns {string}
 */
export function chaveMatch(nome) {
  const base = normalizeNome(nome)
  const tokens = base
    .split(' ')
    .filter((t) => t.length > 0)
    .filter((t) => !SUFIXOS_UF.has(t))
    .filter((t) => !PALAVRAS_RUIDO.has(t))
  const limpos = tokens.length > 0 ? tokens : base.split(' ')
  return limpos.join(' ').trim()
}

/**
 * Constrói índice normalizado da API: chaveMatch(strTeam) → dados.
 * @param {{teams: Array<{strTeam:string,strTeamShort?:string,strBadge?:string,strLocation?:string}>|null}} payload
 * @param {string} serie
 * @param {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>} [into]
 * @returns {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>}
 */
export function indexarLiga(payload, serie, into = new Map()) {
  const teams = payload?.teams
  if (!Array.isArray(teams)) return into
  for (const t of teams) {
    if (!t?.strTeam) continue
    const chave = chaveMatch(t.strTeam)
    if (!chave || into.has(chave)) continue
    into.set(chave, {
      nome: t.strTeam,
      badge: t.strBadge || null,
      serie,
      location: t.strLocation || null,
    })
  }
  return into
}

/**
 * Casa um clube do diretório com o índice da API.
 * Ordem: chave direta → alias → sem ruído.
 * @param {{nome:string}} clube
 * @param {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>} indice
 * @returns {{nome:string,badge:string|null,serie:string,location:string|null}|null}
 */
export function casarClube(clube, indice) {
  const chave = chaveMatch(clube.nome)
  if (indice.has(chave)) return indice.get(chave)

  const aliasKey = normalizeNome(clube.nome)
  const alias = ALIASES[aliasKey]
  if (alias) {
    const chaveAlias = chaveMatch(alias)
    if (indice.has(chaveAlias)) return indice.get(chaveAlias)
  }
  return null
}

/**
 * Gera slug a partir de nome + UF, garantindo UNICIDADE contra um Set de
 * slugs já usados (mutado). Sufixo incremental em colisão.
 * @param {string} nome
 * @param {string} estado UF
 * @param {Set<string>} usados slugs já existentes/gerados (será mutado)
 * @returns {string}
 */
export function gerarSlugUnico(nome, estado, usados) {
  const baseNome = normalizeNome(nome).replace(/\s+/g, '-')
  const uf = normalizeNome(estado || '').replace(/\s+/g, '-')
  let base = uf ? `${baseNome}-${uf}` : baseNome
  base = base.replace(/^-+|-+$/g, '') || 'clube'

  let slug = base
  let n = 2
  while (usados.has(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  usados.add(slug)
  return slug
}

/**
 * Chave canônica de casamento de clube (nome + UF), com ALIASES do diretório/catálogo.
 * @param {string} nome
 * @param {string | null | undefined} uf
 * @returns {string}
 */
export function chaveGrupoClube(nome, uf) {
  const nm = normalizeNome(nome ?? '')
  const alias = ALIASES[nm]
  const chave = alias ? chaveMatch(alias) : chaveMatch(nome ?? '')
  return `${chave}|${normalizeNome(uf ?? '')}`
}

/**
 * Dois clubes são o mesmo time (mesma UF) para onboarding e seeds.
 * Usa ALIASES + chaveMatch — sem overlap parcial de tokens (evita Paulista × Corinthians).
 * @param {{ nome: string, estado?: string | null }} a
 * @param {{ nome: string, estado?: string | null }} b
 * @returns {boolean}
 */
export function saoMesmoClube(a, b) {
  if (normalizeNome(a.estado ?? '') !== normalizeNome(b.estado ?? '')) return false
  if (chaveGrupoClube(a.nome, a.estado) === chaveGrupoClube(b.nome, b.estado)) return true
  return chaveMatch(a.nome) === chaveMatch(b.nome)
}

/**
 * Escolhe a Afiliacao canônica de um grupo (mais tenants → escudo → apelido).
 * @param {Array<{ _count?: { tenants: number }, escudoUrl?: string | null, apelido?: string | null }>} candidatos
 * @returns {number} índice do canônico
 */
export function indiceAfiliacaoCanonica(candidatos) {
  let best = 0
  for (let i = 1; i < candidatos.length; i += 1) {
    const c = candidatos[i]
    const b = candidatos[best]
    const ct = c._count?.tenants ?? 0
    const bt = b._count?.tenants ?? 0
    if (ct > bt) {
      best = i
      continue
    }
    if (ct < bt) continue
    if (c.escudoUrl && !b.escudoUrl) {
      best = i
      continue
    }
    if (!c.escudoUrl && b.escudoUrl) continue
    if (c.apelido && !b.apelido) best = i
  }
  return best
}
