import type { ReactNode } from 'react'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { MENCAO_REGEX, HASHTAG_REGEX } from '@torcida/types'

interface PostConteudoRichProps {
  conteudo: string
  className?: string
}

function renderSegment(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Grupos: 1–2 menção (nome, userId); 3 hashtag.
  const combined = new RegExp(
    `(?:${MENCAO_REGEX.source})|(?:${HASHTAG_REGEX.source})`,
    'giu',
  )
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[0].startsWith('@[')) {
      const nome = m[1]
      const userId = m[2]
      nodes.push(
        <ComunidadePrefetchLink
          key={`${keyPrefix}-m-${i}`}
          href={`/portal/comunidade/perfil/${userId}`}
          className="font-semibold text-[rgb(var(--foreground))] underline decoration-[rgb(var(--foreground)_/_0.45)] underline-offset-2 hover:decoration-[rgb(var(--foreground))]"
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

/** Renderiza menções @[Nome](user:id) e #hashtags como links. */
export function PostConteudoRich({ conteudo, className }: PostConteudoRichProps) {
  const lines = conteudo.split('\n')
  return (
    <p className={className ?? 'whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]'}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {renderSegment(line, `l${li}`)}
        </span>
      ))}
    </p>
  )
}
