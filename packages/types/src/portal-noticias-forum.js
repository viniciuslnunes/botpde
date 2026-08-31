import { z } from 'zod'

/** @typedef {'nacional' | 'torcida' | 'unidade'} EscopoComunidade */

export const FORUM_TITULO_MAX = 180
export const FORUM_CORPO_MAX = 8000
export const ARTIGO_TITULO_MAX = 180
export const ARTIGO_RESUMO_MAX = 400
export const ARTIGO_CORPO_MAX = 20000
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

export function parseOrdemTopico(valor) {
  if (valor === 'populares' || valor === 'acessados') return valor
  return 'recentes'
}

export function parseJanelaRanking(valor) {
  if (valor === 'semana') return 'semana'
  return 'geral'
}

export const moderarTopicoSchema = z.object({
  topicoId: z.string().min(1),
  acao: z.enum(['fixar', 'ocultar']),
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
  alvoTipo: z.enum(['ARTIGO', 'NOTICIA', 'TOPICO', 'RESPOSTA']),
  alvoId: z.string().min(1),
  valor: z.union([z.literal(1), z.literal(-1)]),
})

export const comentarPracaSchema = z.object({
  alvoTipo: z.enum(['ARTIGO', 'NOTICIA']),
  alvoId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(PRACA_COMENTARIO_MAX),
})

export const publicarArtigoSchema = z.object({
  titulo: z.string().trim().min(3).max(ARTIGO_TITULO_MAX),
  resumo: z.string().trim().max(ARTIGO_RESUMO_MAX).optional(),
  corpo: z.string().trim().min(1).max(ARTIGO_CORPO_MAX),
  capaUrl: z.string().url().max(500).optional(),
})

export const concederFonteVerificadaSchema = z.object({
  membroId: z.string().min(1),
  conceder: z.boolean(),
})
