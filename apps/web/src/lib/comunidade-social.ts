import { MENCAO_REGEX, HASHTAG_REGEX } from '@torcida/types'

export interface MencaoParsed {
  nome: string
  userId: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Extrai IDs de usuários mencionados no formato @[Nome](user:uuid). */
export function extrairMencoes(conteudo: string): MencaoParsed[] {
  const vistos = new Set<string>()
  const result: MencaoParsed[] = []
  const re = new RegExp(MENCAO_REGEX.source, MENCAO_REGEX.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(conteudo)) !== null) {
    const userId = m[2]
    if (!vistos.has(userId)) {
      vistos.add(userId)
      result.push({ nome: m[1], userId })
    }
  }
  return result
}

/** Token persistido no banco / notificação. */
export function formatarMencaoToken(nome: string, userId: string): string {
  const safe = nome.trim() || 'Membro'
  return `@[${safe}](user:${userId})`
}

/** Texto legível no composer: @Nome (sem o token cru). */
export function formatarMencaoLegivel(nome: string): string {
  const safe = nome.trim() || 'Membro'
  return `@${safe} `
}

/** Converte @[Nome](user:id) → @Nome e devolve as menções rastreadas. */
export function paraTextoLegivel(conteudo: string): { texto: string; mencoes: MencaoParsed[] } {
  const mencoes = extrairMencoes(conteudo)
  if (mencoes.length === 0) return { texto: conteudo, mencoes }
  const re = new RegExp(MENCAO_REGEX.source, MENCAO_REGEX.flags)
  const texto = conteudo.replace(re, (_full, nome: string) => `@${nome}`)
  return { texto, mencoes }
}

/** Remove menções cujo @Nome sumiu do texto legível. */
export function podarMencoes(texto: string, mencoes: MencaoParsed[]): MencaoParsed[] {
  return mencoes.filter((m) => {
    const re = new RegExp(`@${escapeRegExp(m.nome)}(?![\\p{L}\\p{N}_])`, 'u')
    return re.test(texto)
  })
}

/**
 * Volta @Nome → @[Nome](user:id) para persistir.
 * Nomes mais longos primeiro evitam colisão parcial.
 */
export function serializarMencoes(texto: string, mencoes: MencaoParsed[]): string {
  if (mencoes.length === 0) return texto
  const sorted = [...mencoes].sort((a, b) => b.nome.length - a.nome.length)
  let result = texto
  for (const m of sorted) {
    const re = new RegExp(`@${escapeRegExp(m.nome)}(?![\\p{L}\\p{N}_])`, 'gu')
    result = result.replace(re, formatarMencaoToken(m.nome, m.userId))
  }
  return result
}

/** Normaliza texto pt-BR para comparação (minúsculas, sem acentos). */
export function foldAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Normaliza hashtags (sem #, minúsculas, sem acentos básicos). */
export function normalizarHashtag(raw: string): string {
  return foldAccents(raw).replace(/[^a-z0-9_]/g, '')
}

export function extrairHashtags(conteudo: string): string[] {
  const vistos = new Set<string>()
  const result: string[] = []
  const re = new RegExp(HASHTAG_REGEX.source, HASHTAG_REGEX.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(conteudo)) !== null) {
    const tag = normalizarHashtag(m[1])
    if (tag.length >= 2 && !vistos.has(tag)) {
      vistos.add(tag)
      result.push(tag)
    }
  }
  return result
}

/** Insere menção no texto (token persistido — preferir formatarMencaoLegivel no composer). */
export function formatarMencao(nome: string, userId: string): string {
  return `${formatarMencaoToken(nome, userId)} `
}

export type TipoReacaoSocial = 'CURTIR'

export const REACOES_CONFIG: Record<
  TipoReacaoSocial,
  { label: string; emoji: string; cor: string }
> = {
  CURTIR: { label: 'Curtir', emoji: '♥', cor: 'primary' },
}

/** Vídeo nativo (Cloudinary ou arquivo). Não inclui embeds sociais. */
const VIDEO_URL_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i

export function isVideoUrl(url: string): boolean {
  return url.includes('/video/upload/') || VIDEO_URL_EXT.test(url)
}

/** Permalink estável de um post no portal. */
export function linkPostComunidade(postId: string): string {
  return `/portal/comunidade/post/${postId}`
}

/** Permalink do tópico do fórum no canal ativo. */
export function linkTopicoForum(
  id: string,
  escopo: 'nacional' | 'torcida' | 'unidade',
): string {
  return `/portal/comunidade/forum/${id}?escopo=${escopo}`
}
