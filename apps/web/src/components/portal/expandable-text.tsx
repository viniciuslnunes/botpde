'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { PostConteudoRich } from './post-conteudo-rich'

const LINE_CLAMP: Record<number, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  6: 'line-clamp-6',
  8: 'line-clamp-[8]',
}

type Lines = keyof typeof LINE_CLAMP

interface ExpandableTextBase {
  /** Linhas visíveis quando recolhido. */
  lines?: Lines
  className?: string
  buttonClassName?: string
}

type ExpandableTextProps =
  | (ExpandableTextBase & { text: string; conteudo?: never })
  | (ExpandableTextBase & { conteudo: string; text?: never })

/**
 * Texto do feed com clamp + "Ver mais" / "Ver menos".
 * - `text`: texto puro (ex.: corpo do comunicado)
 * - `conteudo`: rich (menções, hashtags, URLs) via PostConteudoRich
 * O botão só aparece quando o conteúdo realmente ultrapassa o clamp.
 */
export function ExpandableText({
  text,
  conteudo,
  lines = 4,
  className,
  buttonClassName,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement | null>(null)

  const measure = useCallback(() => {
    const el = bodyRef.current
    if (!el || expanded) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [expanded])

  useLayoutEffect(() => {
    measure()
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, text, conteudo, lines])

  useLayoutEffect(() => {
    if (!expanded) measure()
  }, [expanded, measure])

  const clampClass = expanded ? '' : LINE_CLAMP[lines]
  const showToggle = overflows || expanded

  const button = showToggle ? (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={
        buttonClassName ??
        'mt-1 text-sm font-semibold text-[rgb(var(--color-primary-fg))] hover:underline'
      }
    >
      {expanded ? 'Ver menos' : 'Ver mais'}
    </button>
  ) : null

  const mergedClass = [className, clampClass].filter(Boolean).join(' ')

  if (conteudo != null) {
    return (
      <div>
        <PostConteudoRich conteudo={conteudo} contentRef={bodyRef} className={mergedClass} />
        {button}
      </div>
    )
  }

  return (
    <div>
      <p ref={bodyRef} className={mergedClass}>
        {text}
      </p>
      {button}
    </div>
  )
}
