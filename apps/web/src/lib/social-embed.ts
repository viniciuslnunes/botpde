/**
 * Classificação de anexos do feed. `Post.midiaUrls` guarda tanto URLs de imagem
 * (Cloudinary) quanto links de redes sociais — aqui separamos e detectamos o
 * provedor de cada embed, sem depender de schema novo. Funções puras, usáveis
 * no cliente e no servidor.
 */

export type EmbedProvider = 'youtube' | 'twitter' | 'instagram' | 'tiktok'
export type MediaKind = 'image' | 'video' | 'sticker'
export interface MediaAttachment {
  type: MediaKind
  url: string
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i

export const EMBED_HOSTS: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export function isCloudinaryUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\//.test(url)
}

function normalizeSocialHost(hostname: string): string {
  return hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^mobile\./, '')
}

export function detectEmbedProvider(url: string): EmbedProvider | null {
  try {
    const host = normalizeSocialHost(new URL(url).hostname)
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
    if (host === 'twitter.com' || host === 'x.com') return 'twitter'
    if (host === 'instagram.com') return 'instagram'
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
    return null
  } catch {
    return null
  }
}

export function isSocialUrl(url: string): boolean {
  return detectEmbedProvider(url) !== null
}

export function isImageUrl(url: string): boolean {
  return isCloudinaryUrl(url) || IMAGE_EXT.test(url)
}

export function isCloudinaryVideo(url: string): boolean {
  return isCloudinaryUrl(url) && (/\/video\/upload\//.test(url) || VIDEO_EXT.test(url))
}

/** Sticker embutido no app (servido de /public/stickers). Caminho relativo. */
export function isStickerPath(url: string): boolean {
  return /^\/stickers\/[\w-]+\.svg$/.test(url)
}

/** Poster (primeiro frame) de um vídeo do Cloudinary, via transformação de URL. */
export function cloudinaryVideoPoster(url: string): string {
  return url.replace('/video/upload/', '/video/upload/so_0/').replace(VIDEO_EXT, '.jpg')
}

export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = normalizeSocialHost(u.hostname)
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    const v = u.searchParams.get('v')
    if (v) return v
    const m = u.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/)
    return m ? m[2] : null
  } catch {
    return null
  }
}

export function twitterStatusId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/status\/(\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function tiktokVideoId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/video\/(\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export type InstagramMediaKind = 'p' | 'reel' | 'tv'

/**
 * Extrai kind+id de permalinks oficiais e variantes comuns (share, username no path).
 * URLs com `/username/p/...` quebram o embed.js (iframe da home → X-Frame-Options deny).
 */
export function parseInstagramPost(url: string): { kind: InstagramMediaKind; id: string } | null {
  try {
    const host = normalizeSocialHost(new URL(url).hostname)
    if (host !== 'instagram.com') return null
    const m = new URL(url).pathname.match(/\/(?:share\/)?(p|reel|reels|tv)\/([^/?]+)/)
    if (!m) return null
    const kind: InstagramMediaKind = m[1] === 'reels' ? 'reel' : (m[1] as InstagramMediaKind)
    return { kind, id: m[2] }
  } catch {
    return null
  }
}

/** Permalink canônico com trailing slash — o que o player /embed espera. */
export function instagramPermalink(url: string): string | null {
  const parsed = parseInstagramPost(url)
  if (!parsed) return null
  return `https://www.instagram.com/${parsed.kind}/${parsed.id}/`
}

/** Src do iframe oficial do Instagram (`/p|reel|tv/{id}/embed`) — permite framing. */
export function instagramEmbedSrc(url: string, widthPx?: number): string | null {
  const parsed = parseInstagramPost(url)
  if (!parsed) return null
  const wp = widthPx ? resolveEmbedFrameWidth('instagram', widthPx) : EMBED_FRAME_MAX_WIDTH.instagram
  return `https://www.instagram.com/${parsed.kind}/${parsed.id}/embed/?cr=1&v=14&wp=${wp}`
}

export function twitterEmbedSrc(url: string, widthPx?: number): string | null {
  const id = twitterStatusId(url)
  if (!id) return null
  const w = widthPx ? resolveEmbedFrameWidth('twitter', widthPx) : EMBED_FRAME_MAX_WIDTH.twitter
  return `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&width=${w}`
}

export function tiktokEmbedSrc(url: string): string | null {
  const id = tiktokVideoId(url)
  if (!id) return null
  return `https://www.tiktok.com/embed/v2/${id}`
}

/** Largura nativa do player — esticar além disso só cria faixas laterais. */
export const EMBED_FRAME_MAX_WIDTH: Record<Exclude<EmbedProvider, 'youtube'>, number> = {
  tiktok: 325,
  instagram: 540,
  twitter: 550,
}

export function resolveEmbedFrameWidth(
  provider: EmbedProvider,
  cardWidthPx: number,
): number {
  if (provider === 'youtube') {
    return Math.max(Math.round(cardWidthPx) || 360, 280)
  }
  const cap = EMBED_FRAME_MAX_WIDTH[provider]
  const card = Math.round(cardWidthPx) || cap
  return Math.min(Math.max(card, 280), cap)
}

/** Origens que enviam `postMessage` de resize dos iframes oficiais. */
export const EMBED_RESIZE_ORIGINS: Record<Exclude<EmbedProvider, 'youtube'>, readonly string[]> = {
  twitter: ['https://platform.twitter.com', 'https://twitter.com', 'https://x.com'],
  instagram: ['https://www.instagram.com', 'https://instagram.com'],
  tiktok: ['https://www.tiktok.com'],
}

let tiktokFrameSeq = 0

/**
 * Nome do iframe exigido pelo player TikTok para emitir altura via postMessage
 * (`__tt_embed__v` + id com 17 dígitos — documentado indiretamente via amp-tiktok).
 */
export function nextTikTokEmbedFrameName(): string {
  tiktokFrameSeq += 1
  return `__tt_embed__v${String(tiktokFrameSeq).padStart(17, '0')}`
}

/**
 * Altura inicial na largura nativa do player (não na largura do card).
 * Buffer generoso no chrome — postMessage refina depois.
 */
export function estimateEmbedHeight(provider: EmbedProvider, url: string, widthPx: number): number {
  const w = resolveEmbedFrameWidth(provider, widthPx)
  switch (provider) {
    case 'youtube':
      return Math.round((w * 9) / 16)
    case 'tiktok':
      // player 9:16 + perfil/CTA/caption do embed/v2
      return Math.round((w * 16) / 9) + 400
    case 'instagram':
      if (/\/(reel|reels)\//i.test(url)) return Math.round((w * 16) / 9) + 260
      return Math.round(w * 1.15) + 260
    case 'twitter':
      return Math.round(w * 0.9) + 360
    default:
      return 560
  }
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

function positiveHeight(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 80) return null
  return Math.min(Math.ceil(n), 2400)
}

function positiveWidth(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 120) return null
  return Math.round(n)
}

export interface EmbedHeightReport {
  height: number
  /** Largura reportada pelo player (TikTok / X). */
  width?: number
}

/**
 * Extrai altura útil das mensagens oficiais de resize (X / Instagram / TikTok).
 * Retorna null se a mensagem não for de medição.
 */
export function parseEmbedHeightMessage(
  provider: EmbedProvider,
  data: unknown,
): EmbedHeightReport | null {
  const msg = asRecord(data)
  if (!msg) return null

  if (provider === 'twitter') {
    if (msg.method === 'twttr.private.resize') {
      const params = msg.params
      if (Array.isArray(params) && params[0] && typeof params[0] === 'object') {
        const p = params[0] as Record<string, unknown>
        const height = positiveHeight(p.height)
        if (!height) return null
        const width = positiveWidth(p.width)
        return width ? { height, width } : { height }
      }
    }
    const embed = asRecord(msg['twttr.embed'])
    if (embed?.method === 'resize') {
      const params = embed.params
      if (Array.isArray(params) && params[0] && typeof params[0] === 'object') {
        const p = params[0] as Record<string, unknown>
        const height = positiveHeight(p.height)
        if (!height) return null
        return { height }
      }
    }
    const height = positiveHeight(msg.height)
    return height ? { height } : null
  }

  if (provider === 'instagram') {
    if (msg.type === 'MEASURE') {
      const details = asRecord(msg.details)
      const height = positiveHeight(details?.height)
      return height ? { height } : null
    }
    const height = positiveHeight(msg.height)
    return height ? { height } : null
  }

  if (provider === 'tiktok') {
    const height = positiveHeight(msg.height)
    if (!height) return null
    const width = positiveWidth(msg.width)
    return width ? { height, width } : { height }
  }

  return null
}

/**
 * Usa a altura reportada pelo player. Não amplia com a largura do card — o
 * conteúdo social não estica; upscale só criava faixas e scroll interno.
 * Buffer de 4px evita scrollbar fantasma por arredondamento.
 */
export function applyEmbedHeightReport(report: EmbedHeightReport): number {
  return Math.min(report.height + 4, 2400)
}

/**
 * Separa os anexos em mídia (imagem/vídeo/sticker) e embeds sociais,
 * preservando a ordem.
 */
export function classifyMedia(urls: string[]): { media: MediaAttachment[]; embeds: string[] } {
  const media: MediaAttachment[] = []
  const embeds: string[] = []
  for (const url of urls) {
    if (!url) continue
    if (isSocialUrl(url)) embeds.push(url)
    else if (isCloudinaryVideo(url)) media.push({ type: 'video', url })
    else if (isStickerPath(url)) media.push({ type: 'sticker', url })
    else media.push({ type: 'image', url })
  }
  return { media, embeds }
}

/** Hosts sociais (com prefixos www/m/mobile) — protocolo opcional no texto. */
const SOCIAL_HOST_IN_TEXT =
  '(?:www\\.|m\\.|mobile\\.)?(?:youtube\\.com|youtu\\.be|twitter\\.com|x\\.com|instagram\\.com|(?:[\\w-]+\\.)?tiktok\\.com)'

/** Captura URL social com ou sem `https://` (cola de WhatsApp / digitação). */
const SOCIAL_URL_IN_TEXT_RE = new RegExp(
  `(?:https?:\\/\\/)?${SOCIAL_HOST_IN_TEXT}\\/[^\\s<>"']+`,
  'gi',
)

/** Normaliza URL social para comparação (sem barra final / query irrelevante). */
function normalizeSocialUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.protocol}//${u.hostname}${path}`.toLowerCase()
  } catch {
    return url.replace(/\/+$/, '').toLowerCase()
  }
}

/** Converte match cru (com ou sem protocolo) em URL absoluta válida para embed. */
export function toAbsoluteSocialUrl(raw: string): string | null {
  const cleaned = raw.replace(/[.,);!?]+$/u, '').trim()
  if (!cleaned) return null
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
  return isSocialUrl(withProtocol) ? withProtocol : null
}

/** Variantes textuais da mesma URL (com/sem protocolo, com/sem www). */
function socialUrlTextVariants(url: string): string[] {
  try {
    const u = new URL(url)
    const host = u.hostname
    const rest = `${u.pathname}${u.search}`
    const hosts = new Set<string>([host])
    if (host.startsWith('www.')) hosts.add(host.slice(4))
    else hosts.add(`www.${host}`)
    if (host.startsWith('m.')) hosts.add(host.slice(2))
    const out = new Set<string>()
    for (const h of hosts) {
      out.add(`https://${h}${rest}`)
      out.add(`http://${h}${rest}`)
      out.add(`${h}${rest}`)
    }
    return [...out]
  } catch {
    return [url]
  }
}

/**
 * Remove do texto as URLs que já serão embutidas via `midiaUrls`, para não
 * duplicar o link acima do preview. Texto acima/abaixo/no meio do link permanece.
 */
export function stripEmbeddedSocialUrls(conteudo: string, midiaUrls: string[]): string {
  const socials = midiaUrls.filter(isSocialUrl)
  if (socials.length === 0 || !conteudo) return conteudo

  const norms = new Set(socials.map(normalizeSocialUrl))
  const variants = socials.flatMap(socialUrlTextVariants)
  const lines = conteudo.split('\n')
  const kept = lines
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      // Linha só com a URL (e pontuação residual) — com ou sem https://
      const onlyUrl = trimmed.replace(/[.,);!?]+$/u, '')
      const absolute = toAbsoluteSocialUrl(onlyUrl)
      if (absolute && norms.has(normalizeSocialUrl(absolute))) {
        return null
      }
      // URL no meio/fim da linha — remove a ocorrência, mantém o resto
      let out = line
      for (const url of variants) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        out = out.replace(new RegExp(`${escaped}/?`, 'gi'), '')
      }
      return out.replace(/[ \t]{2,}/g, ' ').trimEnd()
    })
    .filter((line): line is string => line !== null)

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Primeira URL de rede social encontrada num texto — usada pelo composer. */
export function firstSocialUrlInText(text: string): string | null {
  const matches = text.match(SOCIAL_URL_IN_TEXT_RE)
  if (!matches) return null
  for (const raw of matches) {
    const url = toAbsoluteSocialUrl(raw)
    if (url) return url
  }
  return null
}

/** Garante que midias inclua o embed detectado no texto (cliente ou servidor). */
export function ensureSocialEmbedInMidias(conteudo: string, midias: string[]): string[] {
  const fromText = firstSocialUrlInText(conteudo)
  if (!fromText) return midias
  const norm = normalizeSocialUrl(fromText)
  if (midias.some((m) => isSocialUrl(m) && normalizeSocialUrl(m) === norm)) return midias
  if (midias.some(isSocialUrl)) return midias
  return [...midias, fromText]
}

const MAX_MIDIAS_PADRAO = 10

/** Promove link social do texto para `midiaUrls` (persistência / API). */
export function midiasComEmbedDoTexto(
  conteudo: string,
  midias: string[],
  max = MAX_MIDIAS_PADRAO,
): string[] {
  return ensureSocialEmbedInMidias(conteudo, midias).slice(0, max)
}

/** Ao editar texto, substitui embed social anterior pelo detectado no conteúdo novo. */
export function midiasAposEditarConteudo(conteudo: string, midiasAtuais: string[]): string[] {
  const naoSociais = midiasAtuais.filter((m) => !isSocialUrl(m))
  return midiasComEmbedDoTexto(conteudo, naoSociais)
}
