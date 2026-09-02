import { z } from 'zod'
import { CODIGOS_DENUNCIA_UI } from './moderacao.js'

/** @typedef {'nacional' | 'torcida' | 'unidade'} EscopoComunidade */

export const FORUM_TITULO_MAX = 180
export const FORUM_CORPO_MAX = 8000
export const ARTIGO_TITULO_MAX = 180
export const ARTIGO_RESUMO_MAX = 400
export const ARTIGO_CORPO_MAX = 20000
export const ARTIGO_BLOCOS_MAX = 40
export const ARTIGO_BLOCO_TEXTO_MAX = 4000
export const ARTIGO_BLOCO_LEGENDA_MAX = 240
export const PRACA_COMENTARIO_MAX = 2000

/** Sinal barato: teto de tópicos + respostas + votos emitidos por semana. */
export const TETO_SINAIS_BARATOS_SEMANA = 40

export const PESO_TOPICO = 3
export const PESO_RESPOSTA = 2
export const PESO_GOSTEI_RECEBIDO = 1
export const PESO_NAO_GOSTEI_RECEBIDO = -2

/**
 * Chave estável do ranking. Postgres unique ignora NULL, então não dá para
 * usar (userId, tenantId?) — a chave sempre é string.
 * @param {{ tenantId: string } | { afiliacaoId: string }} ancora
 */
export function escopoChavePraca(ancora) {
  if ('tenantId' in ancora && ancora.tenantId) return `t:${ancora.tenantId}`
  if ('afiliacaoId' in ancora && ancora.afiliacaoId) return `a:${ancora.afiliacaoId}`
  throw new Error('escopoChavePraca exige tenantId ou afiliacaoId')
}

/**
 * Where da query de artigo/tópico para o canal ativo.
 * Sem ancestral: unidade ≠ sede ≠ irmã ≠ CN.
 *
 * @param {EscopoComunidade} escopo
 * @param {{ tenantId: string | null, afiliacaoId: string | null }} ancora
 * @returns {{ artigos: { tenantId: string, status: 'PUBLICADO' } | { id: { in: string[] } }, topicos: Record<string, unknown> }}
 */
export function wherePracaNoEscopo(escopo, ancora) {
  const vazio = { id: { in: /** @type {string[]} */ ([]) } }
  if (escopo === 'nacional') {
    if (!ancora.afiliacaoId) {
      return { artigos: vazio, topicos: { id: { in: [] } } }
    }
    return {
      artigos: vazio,
      topicos: { escopo: 'CLUBE', afiliacaoId: ancora.afiliacaoId, status: 'VISIVEL' },
    }
  }
  if (!ancora.tenantId) {
    return { artigos: vazio, topicos: { id: { in: [] } } }
  }
  return {
    artigos: { tenantId: ancora.tenantId, status: 'PUBLICADO' },
    topicos: { escopo: 'TORCIDA', tenantId: ancora.tenantId, status: 'VISIVEL' },
  }
}

/**
 * @param {EscopoComunidade} escopo
 * @param {{ tenantId: string | null }} ancora
 * @param {string} artigoTenantId
 */
export function podeVerArtigoNoEscopo(escopo, ancora, artigoTenantId) {
  if (escopo === 'nacional') return false
  return Boolean(ancora.tenantId && ancora.tenantId === artigoTenantId)
}

/**
 * @param {EscopoComunidade} escopo
 * @param {{ escopo: 'CLUBE' | 'TORCIDA', tenantId: string | null, afiliacaoId: string | null }} topico
 * @param {{ tenantId: string | null, afiliacaoId: string | null }} ancora
 */
export function podeVerTopicoNoEscopo(escopo, ancora, topico) {
  if (escopo === 'nacional') {
    return topico.escopo === 'CLUBE' && Boolean(ancora.afiliacaoId && topico.afiliacaoId === ancora.afiliacaoId)
  }
  return (
    topico.escopo === 'TORCIDA' &&
    Boolean(ancora.tenantId && topico.tenantId === ancora.tenantId)
  )
}

/**
 * @param {'imprensa' | 'oficial' | 'verificada' | 'forum'} origem
 */
export function rotuloOrigemPraca(origem) {
  if (origem === 'imprensa') return 'Imprensa'
  if (origem === 'oficial') return 'Oficial'
  if (origem === 'verificada') return 'Fonte verificada'
  return 'Fórum'
}

/** Menor = sobe no mix do feed. Imprensa/oficial nunca abaixo de UGC. */
export function prioridadeOrigemPraca(origem) {
  if (origem === 'imprensa') return 0
  if (origem === 'oficial') return 1
  if (origem === 'verificada') return 2
  return 3
}

/**
 * @template {{ origem: 'imprensa' | 'oficial' | 'verificada' | 'forum', criadoEm: Date }} T
 * @param {T[]} cards
 * @returns {T[]}
 */
export function ordenarCardsPraca(cards) {
  return [...cards].sort((a, b) => {
    const pa = prioridadeOrigemPraca(a.origem)
    const pb = prioridadeOrigemPraca(b.origem)
    if (pa !== pb) return pa - pb
    return b.criadoEm.getTime() - a.criadoEm.getTime()
  })
}

/**
 * @param {number} gostei
 * @param {number} naoGostei
 * @returns {number | null}
 */
export function pctAprovacaoPraca(gostei, naoGostei) {
  const total = gostei + naoGostei
  if (total <= 0) return null
  return Math.round((gostei / total) * 100)
}

/**
 * Delta nas contagens denormalizadas ao mudar o voto do viewer.
 *
 * @param {1 | -1 | 0 | null | undefined} valorAntigo
 * @param {1 | -1 | 0} valorNovo
 * @returns {{ gostei: number, naoGostei: number }}
 */
export function deltaContagemVotoPraca(valorAntigo, valorNovo) {
  const antigo = valorAntigo === 1 || valorAntigo === -1 ? valorAntigo : 0
  const novo = valorNovo === 1 || valorNovo === -1 ? valorNovo : 0
  return {
    gostei: (novo === 1 ? 1 : 0) - (antigo === 1 ? 1 : 0),
    naoGostei: (novo === -1 ? 1 : 0) - (antigo === -1 ? 1 : 0),
  }
}

/**
 * Aplica o delta de voto nas contagens do card (otimista / testes).
 *
 * @param {number} gostei
 * @param {number} naoGostei
 * @param {1 | -1 | 0 | null | undefined} valorAntigo
 * @param {1 | -1 | 0} valorNovo
 * @returns {{ gostei: number, naoGostei: number }}
 */
export function aplicarVotoPracaLocal(gostei, naoGostei, valorAntigo, valorNovo) {
  const d = deltaContagemVotoPraca(valorAntigo, valorNovo)
  return {
    gostei: Math.max(0, gostei + d.gostei),
    naoGostei: Math.max(0, naoGostei + d.naoGostei),
  }
}

/**
 * Número entre Concordo/Discordo: líquido (apoios − rejeições).
 * Cada clique move 1: o oposto primeiro tira o voto (ver `proximoVotoPraca`);
 * trocar +1 por −1 num único clique pulava duas unidades.
 *
 * @param {number} gostei
 * @param {number} [naoGostei]
 */
export function contagemExibidaVotoPraca(gostei, naoGostei = 0) {
  return gostei - naoGostei
}

/**
 * Já tem voto: qualquer clique volta ao neutro (mesmo botão ou o oposto).
 * Sem voto: aplica o clicado. Assim Concordo→Discordo vai 6→5, não 6→4.
 *
 * @param {1 | -1 | null | undefined} anterior
 * @param {1 | -1} clicado
 * @returns {1 | -1 | 0}
 */
export function proximoVotoPraca(anterior, clicado) {
  if (anterior === 1 || anterior === -1) return 0
  return clicado
}

export const LIMIAR_RANKING_PRACA = 5

/**
 * Faixa de engajamento do tópico — rótulo, não cargo.
 * @param {{ gostei: number, respostasCount: number, visitas: number }} t
 * @returns {'lendario' | 'epico' | null}
 */
export function faixaEngajamentoTopico(t) {
  const score = t.gostei + t.respostasCount * 2 + Math.min(t.visitas, 50)
  if (score >= 80) return 'lendario'
  if (score >= 30) return 'epico'
  return null
}

export const SINAIS_BARATOS_PRACA = ['topico', 'resposta', 'voto_emitido']

/** Janela rolante de 7 dias — evita fuso na borda da semana civil. */
export function inicioJanelaSinaisPraca(agora = new Date()) {
  return new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)
}

/**
 * Lower bound de Wilson (z≈1.96). 1 voto positivo não ganha de 48–2.
 * @param {number} ups
 * @param {number} downs
 * @param {number} [z]
 */
export function wilsonLowerBound(ups, downs, z = 1.96) {
  const n = Number(ups) + Number(downs)
  if (!(n > 0)) return 0
  const phat = Number(ups) / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = phat + z2 / (2 * n)
  const spread = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)
  return (centre - spread) / denom
}

/**
 * Score "em alta" do tópico: recência (72h), Wilson da aprovação,
 * volume de respostas e voto líquido (negativo pesa 2×), mídia, pin.
 * Pendente/rejeitado não devem entrar no ranking público — filtre antes.
 *
 * @param {{
 *   gostei: number
 *   naoGostei: number
 *   respostasCount: number
 *   criadoEm: Date | string
 *   midiaUrls?: string[]
 *   fixado?: boolean
 * }} t
 * @param {Date} [agora]
 */
export function scoreHotTopico(t, agora = new Date()) {
  const criado = t.criadoEm instanceof Date ? t.criadoEm : new Date(t.criadoEm)
  const ageHours = Math.max(0, (agora.getTime() - criado.getTime()) / 3_600_000)
  const freshness = Math.max(0, 72 - ageHours) * 1.5
  const totalVotos = t.gostei + t.naoGostei
  const quality = wilsonLowerBound(t.gostei, t.naoGostei)
  const wilson = quality * 40
  const liquido = t.gostei - t.naoGostei * 2
  const replyWeight = totalVotos === 0 ? 1 : Math.max(0.15, quality)
  const volume = Math.max(0, liquido) * 1.25 + t.respostasCount * 2.25 * replyWeight
  const mediaBoost = (t.midiaUrls?.length ?? 0) > 0 ? 2 : 0
  const pinBoost = t.fixado ? 12 : 0
  return freshness + wilson + volume + mediaBoost + pinBoost
}

/**
 * @param {string} [status]
 */
export function prioridadeStatusListagem(status) {
  if (status === 'PENDENTE') return 0
  if (status === 'VISIVEL') return 1
  if (status === 'REJEITADO') return 2
  return 3
}

/**
 * @template {{
 *   status?: string
 *   fixado?: boolean
 *   gostei: number
 *   naoGostei: number
 *   respostasCount: number
 *   criadoEm: Date | string
 *   atualizadoEm?: Date | string
 *   midiaUrls?: string[]
 * }} T
 * @param {T[]} topicos
 * @param {Date} [agora]
 * @returns {T[]}
 */
export function rankTopicosHot(topicos, agora = new Date()) {
  return [...topicos].sort((a, b) => {
    const sa = prioridadeStatusListagem(a.status)
    const sb = prioridadeStatusListagem(b.status)
    if (sa !== sb) return sa - sb
    if (Boolean(a.fixado) !== Boolean(b.fixado)) return a.fixado ? -1 : 1
    const diff = scoreHotTopico(b, agora) - scoreHotTopico(a, agora)
    if (diff !== 0) return diff
    const ta = a.atualizadoEm instanceof Date ? a.atualizadoEm : new Date(a.atualizadoEm ?? a.criadoEm)
    const tb = b.atualizadoEm instanceof Date ? b.atualizadoEm : new Date(b.atualizadoEm ?? b.criadoEm)
    return tb.getTime() - ta.getTime()
  })
}

/**
 * Snippet do corpo para a lista compacta (pula a linha do título).
 * @param {string} titulo
 * @param {string} corpo
 * @param {number} [max]
 */
export function resumoDeCorpoForum(titulo, corpo, max = 140) {
  const raw = String(corpo ?? '').trim()
  if (!raw) return null
  const lines = raw.split(/\r?\n/)
  const primeira = (lines[0] ?? '').trim()
  const rest =
    titulo && primeira === String(titulo).trim() ? lines.slice(1).join('\n').trim() : raw
  const compact = rest.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  return compact.length <= max ? compact : `${compact.slice(0, Math.max(1, max - 1))}…`
}

/**
 * @param {string} status
 * @param {{ autorId: string, userId?: string | null, podeModerar?: boolean }} viewer
 */
export function podeVerStatusTopico(status, viewer) {
  if (status === 'VISIVEL') return true
  const ehAutor = Boolean(viewer.userId && viewer.userId === viewer.autorId)
  if (status === 'PENDENTE') return Boolean(viewer.podeModerar || ehAutor)
  if (status === 'REJEITADO') return Boolean(viewer.podeModerar || ehAutor)
  return false
}

/**
 * Listagem do fórum: público só vê VISIVEL; autor vê os próprios pendentes/rejeitados;
 * moderação vê a fila.
 *
 * @param {EscopoComunidade} escopo
 * @param {{ tenantId: string | null, afiliacaoId: string | null }} ancora
 * @param {{ userId?: string | null, podeModerar?: boolean }} [opts]
 * @returns {{
 *   OR: Record<string, unknown>[],
 *   escopo?: string,
 *   tenantId?: string,
 *   afiliacaoId?: string,
 *   id?: { in: string[] },
 * }}
 */
export function whereTopicosNaListagem(escopo, ancora, opts = {}) {
  const publico = wherePracaNoEscopo(escopo, ancora).topicos
  const { status: _status, ...escopoWhere } = publico
  const or = /** @type {Record<string, unknown>[]} */ ([{ status: 'VISIVEL' }])
  if (opts.userId) {
    or.push({ status: 'PENDENTE', autorId: opts.userId })
    or.push({ status: 'REJEITADO', autorId: opts.userId })
  }
  if (opts.podeModerar) {
    or.push({ status: 'PENDENTE' })
  }
  return { ...escopoWhere, OR: or }
}

export function parseOrdemTopico(valor) {
  if (valor === 'populares') return 'em_alta'
  if (valor === 'em_alta' || valor === 'acessados' || valor === 'recentes') return valor
  return 'em_alta'
}

/**
 * Notícias defaultam em Mais vistos (visitas) — o fórum defaulta em alta.
 * @param {string | undefined} valor
 * @returns {'em_alta' | 'acessados' | 'recentes'}
 */
export function parseOrdemNoticia(valor) {
  if (valor === 'em_alta' || valor === 'acessados' || valor === 'recentes') return valor
  return 'acessados'
}

/**
 * Quem publica notícia precisa de um canal oficial da torcida/unidade
 * ou de um canal verificado de portal de notícias (integração futura).
 *
 * @param {{
 *   tipo?: string
 *   canalOficial?: boolean
 *   portalNoticiasVerificado?: boolean
 * } | null | undefined} canal
 */
export function canalElegivelParaNoticia(canal) {
  if (!canal || canal.tipo !== 'CANAL') return false
  return Boolean(canal.canalOficial || canal.portalNoticiasVerificado)
}

/**
 * Reusa `rankTopicosHot`: PUBLICADO conta como VISIVEL; visitas entram no
 * recorte `acessados` (orderBy), não neste score.
 *
 * @template {{
 *   status?: string
 *   fixado?: boolean
 *   gostei: number
 *   naoGostei: number
 *   respostasCount?: number
 *   criadoEm: Date | string
 *   atualizadoEm?: Date | string
 *   midiaUrls?: string[]
 * }} T
 * @param {T[]} itens
 * @param {Date} [agora]
 * @returns {T[]}
 */
export function rankNoticiasHot(itens, agora = new Date()) {
  return rankTopicosHot(
    itens.map((n) => ({
      ...n,
      status: n.status === 'PUBLICADO' ? 'VISIVEL' : n.status,
      respostasCount: n.respostasCount ?? 0,
    })),
    agora,
  )
}

export function parseJanelaRanking(valor) {
  if (valor === 'semana') return 'semana'
  return 'geral'
}

/**
 * Abas do fórum. `compose=1` (URL antiga / `/forum/novo`) cai em `novo`.
 * @param {string | undefined} aba
 * @param {string | undefined} [compose]
 * @returns {'topicos' | 'novo' | 'ranking'}
 */
export function parseForumAba(aba, compose) {
  if (aba === 'novo' || compose === '1' || compose === 'true') return 'novo'
  if (aba === 'ranking') return 'ranking'
  return 'topicos'
}

export const moderarTopicoSchema = z.object({
  topicoId: z.string().min(1),
  acao: z.enum(['fixar', 'ocultar', 'aprovar', 'rejeitar']),
  motivo: z.string().trim().max(500).optional(),
})

export const moderarRespostaSchema = z.object({
  respostaId: z.string().min(1),
  acao: z.enum(['rejeitar', 'restaurar']),
  motivo: z.string().trim().max(500).optional(),
})

/**
 * Denúncia na praça (tópico, resposta ou comentário). A categoria vem da lista
 * curta que a pessoa vê; gravidade e SLA são derivados no servidor a partir
 * dela — o cliente nunca envia gravidade.
 */
export const denunciarPracaSchema = z.object({
  alvoTipo: z.enum(['FORUM_TOPICO', 'FORUM_RESPOSTA', 'PRACA_COMENTARIO']),
  alvoId: z.string().min(1),
  categoria: z.enum(/** @type {[string, ...string[]]} */ ([...CODIGOS_DENUNCIA_UI])),
  motivo: z.string().trim().max(500).optional(),
})

export const criarTopicoSchema = z.object({
  titulo: z.string().trim().min(3).max(FORUM_TITULO_MAX),
  corpo: z.string().trim().min(1).max(FORUM_CORPO_MAX),
})

/**
 * Primeira linha do composer vira o título da listagem.
 * O corpo guarda o texto inteiro — igual ao post do feed.
 * @param {string} conteudo
 * @returns {string | null}
 */
export function tituloDeConteudoForum(conteudo) {
  const raw = String(conteudo ?? '').trim()
  if (raw.length < 3) return null
  const primeira = raw.split(/\r?\n/, 1)[0].trim()
  const base = (primeira.length >= 3 ? primeira : raw).replace(/\s+/g, ' ')
  if (base.length < 3) return null
  return base.length <= FORUM_TITULO_MAX ? base : base.slice(0, FORUM_TITULO_MAX)
}

export const criarTopicoComposerSchema = z.object({
  conteudo: z.string().trim().min(3).max(FORUM_CORPO_MAX),
  midias: z.array(z.string().url().max(500)).max(10).optional(),
})

export const editarTopicoSchema = z.object({
  topicoId: z.string().min(1),
  conteudo: z.string().trim().min(3).max(FORUM_CORPO_MAX),
  midias: z.array(z.string().url().max(500)).max(10).optional(),
})

export const responderTopicoSchema = z.object({
  topicoId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(FORUM_CORPO_MAX),
  parentId: z.string().min(1).optional(),
})

export const votarPracaSchema = z.object({
  alvoTipo: z.enum(['ARTIGO', 'NOTICIA', 'TOPICO', 'RESPOSTA', 'COMENTARIO']),
  alvoId: z.string().min(1),
  valor: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
})

export const comentarPracaSchema = z.object({
  alvoTipo: z.enum(['ARTIGO', 'NOTICIA']),
  alvoId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(PRACA_COMENTARIO_MAX),
  parentId: z.string().min(1).optional(),
})

/**
 * Comentários de primeiro nível: saldo de apoios (gostei − naoGostei), depois recência.
 *
 * @template {{ gostei: number, naoGostei: number, criadoEm: Date | string }} T
 * @param {T[]} comentarios
 * @returns {T[]}
 */
export function rankComentariosPraca(comentarios) {
  return [...comentarios].sort((a, b) => {
    const sa = contagemExibidaVotoPraca(a.gostei, a.naoGostei)
    const sb = contagemExibidaVotoPraca(b.gostei, b.naoGostei)
    if (sb !== sa) return sb - sa
    const ta = a.criadoEm instanceof Date ? a.criadoEm : new Date(a.criadoEm)
    const tb = b.criadoEm instanceof Date ? b.criadoEm : new Date(b.criadoEm)
    return tb.getTime() - ta.getTime()
  })
}

export const publicarArtigoSchema = z.object({
  titulo: z.string().trim().min(3).max(ARTIGO_TITULO_MAX),
  resumo: z.string().trim().max(ARTIGO_RESUMO_MAX).optional(),
  corpo: z.string().trim().min(1).max(ARTIGO_CORPO_MAX),
  capaUrl: z.string().url().max(500).optional(),
})

/** Composer de comunicado reusado na praça de notícias (título + corpo + mídia). */
export const publicarArtigoComposerSchema = z.object({
  titulo: z.string().trim().min(3).max(ARTIGO_TITULO_MAX),
  corpo: z.string().trim().min(1).max(ARTIGO_CORPO_MAX),
  midias: z.array(z.string().url().max(500)).max(10).optional(),
})

const EMBED_HOST_RE = /youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|tiktok\.com/i
const VIDEO_URL_RE = /\/video\/upload|\.(?:mp4|webm|mov|m4v)(?:\?|$)/i

/**
 * @param {string | null | undefined} url
 * @returns {'imagem' | 'video' | 'embed' | null}
 */
export function tipoBlocoDeUrl(url) {
  const u = String(url ?? '').trim()
  if (!u) return null
  if (EMBED_HOST_RE.test(u)) return 'embed'
  if (VIDEO_URL_RE.test(u)) return 'video'
  return 'imagem'
}

/**
 * @param {unknown} valor
 * @param {number} [max]
 */
function urlHttpArtigo(valor, max = 500) {
  const u = String(valor ?? '').trim()
  if (!u || u.length > max) return null
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.href
  } catch {
    return null
  }
}

/**
 * @param {unknown} raw
 * @returns {{ tipo: 'texto', texto: string } | { tipo: 'imagem' | 'video' | 'embed', url: string, legenda?: string } | null}
 */
export function parseArtigoBloco(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = /** @type {Record<string, unknown>} */ (raw)
  if (item.tipo === 'texto') {
    const texto = String(item.texto ?? '').trim()
    if (!texto || texto.length > ARTIGO_BLOCO_TEXTO_MAX) return null
    return { tipo: 'texto', texto }
  }
  if (item.tipo === 'imagem' || item.tipo === 'video' || item.tipo === 'embed') {
    const url = urlHttpArtigo(item.url)
    if (!url) return null
    const tipo = tipoBlocoDeUrl(url) ?? item.tipo
    const legenda = String(item.legenda ?? '')
      .trim()
      .slice(0, ARTIGO_BLOCO_LEGENDA_MAX)
    if (tipo === 'embed') return { tipo: 'embed', url }
    return legenda ? { tipo, url, legenda } : { tipo, url }
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {NonNullable<ReturnType<typeof parseArtigoBloco>>[]}
 */
export function parseArtigoBlocos(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (out.length >= ARTIGO_BLOCOS_MAX) break
    const bloco = parseArtigoBloco(item)
    if (bloco) out.push(bloco)
  }
  return out
}

/**
 * Deriva os campos densos (lista, busca, capa) a partir dos blocos.
 *
 * @param {ReturnType<typeof parseArtigoBlocos>} blocos
 */
export function flattenArtigoBlocos(blocos) {
  const textos = []
  const midiaUrls = []
  let capaUrl = /** @type {string | null} */ (null)
  for (const bloco of blocos) {
    if (bloco.tipo === 'texto') {
      textos.push(bloco.texto)
      continue
    }
    midiaUrls.push(bloco.url)
    if (!capaUrl && bloco.tipo === 'imagem') capaUrl = bloco.url
  }
  if (!capaUrl) capaUrl = midiaUrls[0] ?? null
  const corpo = textos.join('\n\n').trim().slice(0, ARTIGO_CORPO_MAX)
  const primeiro = textos[0] ?? ''
  const resumo =
    !primeiro
      ? null
      : primeiro.length <= ARTIGO_RESUMO_MAX
        ? primeiro
        : `${primeiro.slice(0, Math.max(1, ARTIGO_RESUMO_MAX - 1))}…`
  return { corpo: corpo || ' ', midiaUrls, capaUrl, resumo }
}

/**
 * Artigo antigo (só corpo + URLs) vira a mesma sequência da leitura em blocos.
 *
 * @param {string | null | undefined} corpo
 * @param {string[] | null | undefined} midiaUrls
 */
export function blocosDeArtigoLegado(corpo, midiaUrls) {
  /** @type {ReturnType<typeof parseArtigoBlocos>} */
  const blocos = []
  for (const url of midiaUrls ?? []) {
    const tipo = tipoBlocoDeUrl(url)
    if (tipo) blocos.push(tipo === 'embed' ? { tipo, url } : { tipo, url })
  }
  const texto = String(corpo ?? '').trim()
  if (texto && texto !== ' ') blocos.push({ tipo: 'texto', texto })
  return blocos
}

export const artigoBlocoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('texto'),
    texto: z.string().trim().min(1).max(ARTIGO_BLOCO_TEXTO_MAX),
  }),
  z.object({
    tipo: z.literal('imagem'),
    url: z.string().url().max(500),
    legenda: z.string().trim().max(ARTIGO_BLOCO_LEGENDA_MAX).optional(),
  }),
  z.object({
    tipo: z.literal('video'),
    url: z.string().url().max(500),
    legenda: z.string().trim().max(ARTIGO_BLOCO_LEGENDA_MAX).optional(),
  }),
  z.object({
    tipo: z.literal('embed'),
    url: z.string().url().max(500),
  }),
])

/** História em blocos — texto, foto, vídeo e embed intercalados. */
export const publicarArtigoHistoriaSchema = z.object({
  titulo: z.string().trim().min(3).max(ARTIGO_TITULO_MAX),
  resumo: z.string().trim().max(ARTIGO_RESUMO_MAX).optional(),
  blocos: z.array(artigoBlocoSchema).min(1).max(ARTIGO_BLOCOS_MAX),
})

export const concederFonteVerificadaSchema = z.object({
  membroId: z.string().min(1),
  conceder: z.boolean(),
})
