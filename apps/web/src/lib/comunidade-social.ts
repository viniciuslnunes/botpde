import { MENCAO_REGEX, HASHTAG_REGEX } from '@torcida/types'

export interface MencaoParsed {
  nome: string
  userId: string
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

/** Normaliza hashtags (sem #, minúsculas, sem acentos básicos). */
export function normalizarHashtag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '')
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

/** Insere menção no texto (para o composer). */
export function formatarMencao(nome: string, userId: string): string {
  const safe = nome.trim() || 'Membro'
  return `@[${safe}](user:${userId}) `
}

export type TipoReacaoSocial = 'CURTIR' | 'FORCA' | 'VAMOS' | 'PRESENTE'

export const REACOES_CONFIG: Record<
  TipoReacaoSocial,
  { label: string; emoji: string; cor: string }
> = {
  CURTIR: { label: 'Curtir', emoji: '♥', cor: 'primary' },
  FORCA: { label: 'Força', emoji: '⚡', cor: 'amber' },
  VAMOS: { label: 'Vamos!', emoji: '🔥', cor: 'orange' },
  PRESENTE: { label: 'Presente', emoji: '✓', cor: 'emerald' },
}

export function isVideoUrl(url: string): boolean {
  return (
    url.includes('/video/upload/') ||
    url.endsWith('.mp4') ||
    url.endsWith('.webm') ||
    url.endsWith('.mov')
  )
}
