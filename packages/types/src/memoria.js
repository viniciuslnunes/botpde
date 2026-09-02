/**
 * Contrato da Memória (linha do tempo). O eixo é o dia civil em
 * America/Sao_Paulo — não a `FeedTimeline` do mural.
 *
 * Fase 1–5 (entregues): unidade / torcida / clube; fato atrasado; aliados
 * bilaterais; presença com check-in + opt-in. Schema Prisma em `MemoriaFato`,
 * `Tenant.memoriaAliados`, `PerfilMembro.memoriaPresencaVisivel`.
 */

/**
 * @typedef {'unidade' | 'torcida' | 'clube'} MemoriaEscopo
 * @typedef {'PENDENTE' | 'APROVADA' | 'REJEITADA'} MemoriaFatoStatus
 * @typedef {'PUBLICO' | 'TENANT'} MemoriaFatoVisibilidade
 * @typedef {'self' | 'ancestor' | 'descendant' | 'unrelated' | 'allied' | 'rival'} TenantRelation
 */

export const MEMORIA_ESCOPO = /** @type {const} */ ({
  UNIDADE: 'unidade',
  TORCIDA: 'torcida',
  CLUBE: 'clube',
})

export const MEMORIA_FATO_STATUS = /** @type {const} */ ({
  PENDENTE: 'PENDENTE',
  APROVADA: 'APROVADA',
  REJEITADA: 'REJEITADA',
})

/** Atrasada nunca é PRIVADA — o moderador precisa ler o que aprova. */
export const MEMORIA_FATO_VISIBILIDADE = /** @type {const} */ ({
  PUBLICO: 'PUBLICO',
  TENANT: 'TENANT',
})

export const MEMORIA_ESCOPOS = /** @type {readonly MemoriaEscopo[]} */ ([
  MEMORIA_ESCOPO.UNIDADE,
  MEMORIA_ESCOPO.TORCIDA,
  MEMORIA_ESCOPO.CLUBE,
])

/** Flag no tenant raiz. Default off — os dois presidentes precisam ligar. */
export const MEMORIA_ALIADOS_DEFAULT = false

/** Presença visível na linha. Default off — opt-in explícito. */
export const MEMORIA_PRESENCA_DEFAULT = false

/** Slug de capítulo: minúsculas, hífens, sem espaços. */
export const MEMORIA_CAPITULO_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const MEMORIA_CAPITULO_TITULO_MAX = 120
export const MEMORIA_CAPITULO_DESCRICAO_MAX = 500
export const MEMORIA_MARCO_TITULO_MAX = 120
export const MEMORIA_MARCO_DESCRICAO_MAX = 500
export const MEMORIA_CAPITULO_DIAS_MAX = 120

/** Fato atrasado: não é o dia de hoje nem o futuro; teto de 5 anos. */
export const MEMORIA_FATO_ANOS_MAX = 5

/** Publicar na data: teto à frente, alinhado ao calendário da espinha. */
export const MEMORIA_FATO_DIAS_FUTURO_MAX = 90

/**
 * Recorte da Memória segue o **canal da Comunidade** (cookie das abas-escudo),
 * não o tenant ativo da sessão. Sócio da Camisa 12 com a top bar no Timão
 * está na CN — a linha é do clube, sem caravana/unidade.
 *
 * - `nacional` → clube (jogos + mural nacional; zero evento de torcida)
 * - `torcida` → linhagem da organizada
 * - `unidade` → a unidade; chip opcional para a torcida
 *
 * Sem `canal`, cai no legado: CN sem unidade → clube; com unidade → unidade.
 *
 * @param {{
 *   canal?: 'nacional' | 'torcida' | 'unidade',
 *   modoNacional?: boolean,
 *   temUnidade?: boolean,
 * }} ctx
 * @returns {MemoriaEscopo}
 */
export function resolverEscopoMemoriaPadrao(ctx) {
  if (ctx?.canal === 'nacional') return MEMORIA_ESCOPO.CLUBE
  if (ctx?.canal === 'torcida') return MEMORIA_ESCOPO.TORCIDA
  if (ctx?.canal === 'unidade') return MEMORIA_ESCOPO.UNIDADE
  if (ctx?.modoNacional && !ctx.temUnidade) return MEMORIA_ESCOPO.CLUBE
  return MEMORIA_ESCOPO.UNIDADE
}

/**
 * Recortes oferecidos **dentro** da Memória. Trocar para a CN é o chrome
 * (top bar), não um chip. Na unidade, o chip Unidade | Torcida é a memória
 * ampla da organizada.
 *
 * @param {{
 *   canal: 'nacional' | 'torcida' | 'unidade',
 *   temTorcida?: boolean,
 * }} ctx
 * @returns {MemoriaEscopo[]}
 */
export function escoposMemoriaDoCanal(ctx) {
  if (ctx?.canal === 'nacional') return [MEMORIA_ESCOPO.CLUBE]
  if (ctx?.canal === 'torcida') return [MEMORIA_ESCOPO.TORCIDA]
  const out = [MEMORIA_ESCOPO.UNIDADE]
  if (ctx?.temTorcida) out.push(MEMORIA_ESCOPO.TORCIDA)
  return out
}

/**
 * A partida do clube abre nó na espinha?
 * Unidade/torcida: só se o dia já tem fato da unidade. Clube: o jogo é o eixo.
 *
 * @param {MemoriaEscopo} escopo
 * @param {boolean} temFatoLocal
 */
export function partidaAbreEspinha(escopo, temFatoLocal) {
  if (escopo === MEMORIA_ESCOPO.CLUBE) return true
  return Boolean(temFatoLocal)
}

/**
 * Conteúdo que o escopo clube pode listar. Interno da torcida (TENANT/PRIVADO,
 * RSVP, check-in) nunca entra — mesmo que o viewer seja sócio da Gaviões.
 *
 * @param {{
 *   alcanceNacional?: boolean,
 *   visibilidade?: string,
 *   tenantSintetico?: boolean,
 * }} item
 */
export function itemEntraNoEscopoClube(item) {
  if (!item) return false
  if (item.tenantSintetico) return item.visibilidade !== 'PRIVADO' && item.visibilidade !== 'TENANT'
  if (item.alcanceNacional && item.visibilidade === 'PUBLICO') return true
  return false
}

/**
 * Aliados vêem a memória só com as duas flags ligadas + aliança ATIVA.
 * Rival nunca. Canal restrito (R5) já rebaixa a relação antes desta função.
 *
 * @param {{
 *   relation: TenantRelation,
 *   flagOrigem: boolean,
 *   flagAliado: boolean,
 *   visibilidade?: string,
 * }} opts
 */
export function aliadoPodeVerMemoria(opts) {
  if (!opts) return false
  if (opts.relation === 'rival' || opts.relation === 'unrelated') return false
  if (opts.relation !== 'allied') return false
  if (!opts.flagOrigem || !opts.flagAliado) return false
  if (opts.visibilidade && opts.visibilidade !== 'PUBLICO') return false
  return true
}

function ehDiaIso(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function addDaysIso(iso, n) {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + n)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function pisoMemoriaIso(hojeIso) {
  const anoMin = Number(hojeIso.slice(0, 4)) - MEMORIA_FATO_ANOS_MAX
  return `${anoMin}${hojeIso.slice(4)}`
}

/**
 * Dia válido para memória atrasada (não hoje, não futuro, ≤ N anos).
 *
 * @param {string} diaIso YYYY-MM-DD
 * @param {string} hojeIso YYYY-MM-DD
 */
export function diaValidoParaFatoAtrasado(diaIso, hojeIso) {
  if (!ehDiaIso(diaIso) || !ehDiaIso(hojeIso)) return false
  if (diaIso >= hojeIso) return false
  return diaIso >= pisoMemoriaIso(hojeIso)
}

/**
 * Dá para publicar na Memória nesta data (passado, hoje ou futuro do calendário).
 * Passado continua fato atrasado (moderação). Hoje/futuro entram na hora.
 *
 * @param {string} diaIso YYYY-MM-DD
 * @param {string} hojeIso YYYY-MM-DD
 */
export function diaValidoParaPublicarMemoria(diaIso, hojeIso) {
  if (!ehDiaIso(diaIso) || !ehDiaIso(hojeIso)) return false
  if (diaIso < pisoMemoriaIso(hojeIso)) return false
  return diaIso <= addDaysIso(hojeIso, MEMORIA_FATO_DIAS_FUTURO_MAX)
}

/**
 * Quem aparece em "quem estava": check-in real + opt-in + mesmo tenant.
 * RSVP sem check-in não conta. Aliado/clube/rival nunca.
 *
 * @param {{
 *   optIn: boolean,
 *   mesmoTenant: boolean,
 *   temCheckIn: boolean,
 *   escopo: MemoriaEscopo,
 *   relation?: TenantRelation,
 * }} opts
 */
export function podeListarPresenca(opts) {
  if (!opts?.optIn) return false
  if (!opts.mesmoTenant) return false
  if (!opts.temCheckIn) return false
  if (opts.escopo !== MEMORIA_ESCOPO.UNIDADE && opts.escopo !== MEMORIA_ESCOPO.TORCIDA) {
    return false
  }
  if (opts.relation === 'rival' || opts.relation === 'allied' || opts.relation === 'unrelated') {
    return false
  }
  return true
}

/**
 * Normaliza slug de capítulo da memória.
 * @param {string} raw
 * @returns {string | null}
 */
export function slugMemoriaCapitulo(raw) {
  if (typeof raw !== 'string') return null
  const s = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  if (!s || !MEMORIA_CAPITULO_SLUG_RE.test(s)) return null
  return s
}

/**
 * Filtra dias da espinha para um capítulo (união de dias do capítulo).
 *
 * @param {string[]} diasCapitulo ISO YYYY-MM-DD
 * @param {string[]} diasEspinha
 * @returns {string[]}
 */
export function filtrarDiasPorCapitulo(diasCapitulo, diasEspinha) {
  if (!diasCapitulo?.length) return diasEspinha
  const set = new Set(diasCapitulo)
  return diasEspinha.filter((d) => set.has(d))
}

/** Intenção inferida do texto único do composer da Memória. */
export const MEMORIA_INTENCAO = /** @type {const} */ ({
  FATO: 'fato',
  MARCO: 'marco',
  ANIVERSARIO: 'aniversario',
  EVENTO: 'evento',
})

/** @typedef {'fato' | 'marco' | 'aniversario' | 'evento'} MemoriaIntencao */

/**
 * @typedef {{
 *   intencao: MemoriaIntencao,
 *   conteudo: string | null,
 *   titulo: string | null,
 *   descricao: string | null,
 * }} MemoriaEntradaInterpretada
 */

const PREFIXO_MARCO_RE = /^marco\s*:\s*/i
const PREFIXO_ANIVERSARIO_RE = /^anivers[aá]rio\s*:\s*/i
const DICA_EVENTO_RE =
  /\b(criar|novo|cadastrar|agendar)\s+(um\s+)?(evento|caravana|ensaio|jogo)\b/i

/**
 * @param {string} body
 * @returns {{ titulo: string, descricao: string | null }}
 */
function parseTituloCorpoMemoria(body) {
  const trimmed = body.trim()
  const nl = trimmed.indexOf('\n')
  if (nl === -1) return { titulo: trimmed, descricao: null }
  const titulo = trimmed.slice(0, nl).trim()
  const descricao = trimmed.slice(nl + 1).trim() || null
  return { titulo, descricao }
}

/**
 * Um único campo de texto na Memória — prefixos explícitos direcionam o destino.
 *
 * - `marco: título` (+ linhas = contexto) → marco institucional
 * - `aniversário: …` → marco com título prefixado
 * - menção a criar evento/caravana → dica para a Agenda
 * - resto → fato / relato (moderação se dia passado)
 *
 * @param {string} texto
 * @returns {MemoriaEntradaInterpretada}
 */
export function interpretarEntradaMemoria(texto) {
  const raw = typeof texto === 'string' ? texto.trim() : ''
  if (!raw) {
    return { intencao: MEMORIA_INTENCAO.FATO, conteudo: '', titulo: null, descricao: null }
  }

  if (PREFIXO_MARCO_RE.test(raw)) {
    const body = raw.replace(PREFIXO_MARCO_RE, '').trim()
    const { titulo, descricao } = parseTituloCorpoMemoria(body)
    return {
      intencao: MEMORIA_INTENCAO.MARCO,
      titulo,
      descricao,
      conteudo: null,
    }
  }

  if (PREFIXO_ANIVERSARIO_RE.test(raw)) {
    const body = raw.replace(PREFIXO_ANIVERSARIO_RE, '').trim()
    const { titulo, descricao } = parseTituloCorpoMemoria(body)
    const base = titulo || 'da torcida'
    const tituloFinal = /^anivers[aá]rio/i.test(base) ? base : `Aniversário — ${base}`
    return {
      intencao: MEMORIA_INTENCAO.ANIVERSARIO,
      titulo: tituloFinal,
      descricao,
      conteudo: null,
    }
  }

  if (DICA_EVENTO_RE.test(raw)) {
    return { intencao: MEMORIA_INTENCAO.EVENTO, conteudo: raw, titulo: null, descricao: null }
  }

  return { intencao: MEMORIA_INTENCAO.FATO, conteudo: raw, titulo: null, descricao: null }
}

/**
 * Resolve entrada do composer — `modo` explícito (chip) tem prioridade sobre prefixos.
 *
 * @param {string} texto
 * @param {MemoriaIntencao | null | undefined} modo
 * @returns {MemoriaEntradaInterpretada}
 */
export function resolverEntradaMemoria(texto, modo) {
  if (modo === MEMORIA_INTENCAO.MARCO) {
    const { titulo, descricao } = parseTituloCorpoMemoria(texto)
    return {
      intencao: MEMORIA_INTENCAO.MARCO,
      titulo,
      descricao,
      conteudo: null,
    }
  }
  if (modo === MEMORIA_INTENCAO.ANIVERSARIO) {
    const { titulo, descricao } = parseTituloCorpoMemoria(texto)
    const base = titulo || 'da torcida'
    const tituloFinal = /^anivers[aá]rio/i.test(base) ? base : `Aniversário — ${base}`
    return {
      intencao: MEMORIA_INTENCAO.ANIVERSARIO,
      titulo: tituloFinal,
      descricao,
      conteudo: null,
    }
  }
  if (modo === MEMORIA_INTENCAO.FATO) {
    const raw = typeof texto === 'string' ? texto.trim() : ''
    if (DICA_EVENTO_RE.test(raw)) {
      return { intencao: MEMORIA_INTENCAO.EVENTO, conteudo: raw, titulo: null, descricao: null }
    }
    return { intencao: MEMORIA_INTENCAO.FATO, conteudo: raw, titulo: null, descricao: null }
  }
  return interpretarEntradaMemoria(texto)
}
