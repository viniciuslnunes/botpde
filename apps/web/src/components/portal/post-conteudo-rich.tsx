import type { ReactNode, Ref } from 'react'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { MENCAO_REGEX, HASHTAG_REGEX } from '@torcida/types'
import { toAbsoluteSocialUrl } from '@/lib/social-embed'

interface PostConteudoRichProps {
  conteudo: string
  className?: string
  /** Ref no `<p>` — usado por ExpandableText para medir overflow do clamp. */
  contentRef?: Ref<HTMLParagraphElement>
}

/** http(s) ou host social sem protocolo (youtube.com/..., x.com/...). */
const URL_REGEX =
  /(?:https?:\/\/[^\s<>"']+|(?:www\.|m\.|mobile\.)?(?:youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|(?:[\w-]+\.)?tiktok\.com)\/[^\s<>"']+)/gi

function splitUrlMatch(raw: string): { href: string; trailing: string } {
  const cleaned = raw.replace(/[.,);!?]+$/u, '')
  const absolute = toAbsoluteSocialUrl(cleaned)
  const href = absolute ?? (/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`)
  return { href, trailing: raw.slice(cleaned.length) }
}

function isUrlMatch(raw: string): boolean {
  return (
    /^https?:\/\//i.test(raw) ||
    /^(?:www\.|m\.|mobile\.)?(?:youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|(?:[\w-]+\.)?tiktok\.com)\//i.test(
      raw,
    )
  )
}

function renderSegment(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // URL antes de # — evita hashtag engolir fragmento de link.
  const combined = new RegExp(
    `(?:${URL_REGEX.source})|(?:${MENCAO_REGEX.source})|(?:${HASHTAG_REGEX.source})`,
    'giu',
  )
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (isUrlMatch(m[0])) {
      const { href, trailing } = splitUrlMatch(m[0])
      nodes.push(
        <a
          key={`${keyPrefix}-u-${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium text-[rgb(var(--color-primary-fg))] underline decoration-[rgb(var(--color-primary-fg)_/_0.45)] underline-offset-2 hover:decoration-[rgb(var(--color-primary-fg))]"
        >
          {href}
        </a>,
      )
      if (trailing) nodes.push(trailing)
    } else if (m[0].startsWith('@[')) {
      const nome = m[1]
      const userId = m[2]
      nodes.push(
        <ComunidadePrefetchLink
          key={`${keyPrefix}-m-${i}`}
          href={`/portal/comunidade/perfil/${userId}`}
          className="font-semibold text-[rgb(var(--color-primary-fg))] hover:text-[rgb(var(--color-primary-fg))]"
        >
          @{nome}
        </ComunidadePrefetchLink>,
      )
    } else if (m[0].startsWith('#')) {
      const raw = m[3] ?? m[1]
      const tag = raw.toLowerCase()
      nodes.push(
        <ComunidadePrefetchLink
          key={`${keyPrefix}-h-${i}`}
          href={`/portal/comunidade/hashtag/${encodeURIComponent(tag)}`}
          className="font-semibold text-[rgb(var(--color-primary-fg))] underline decoration-[rgb(var(--color-primary-fg)_/_0.45)] underline-offset-2 hover:decoration-[rgb(var(--color-primary-fg))]"
        >
          #{raw}
        </ComunidadePrefetchLink>,
      )
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Renderiza URLs (guia externa), menções @[Nome](user:id) e #hashtags como links. */
export function PostConteudoRich({ conteudo, className, contentRef }: PostConteudoRichProps) {
  const lines = conteudo.split('\n')
  return (
    <p
      ref={contentRef}
      className={className ?? 'whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]'}
    >
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {renderSegment(line, `l${li}`)}
        </span>
      ))}
    </p>
  )
}
