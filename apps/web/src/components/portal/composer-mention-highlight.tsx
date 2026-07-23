'use client'

import type { MencaoParsed } from '@/lib/comunidade-social'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Camada visual atrás do textarea do composer — coloriza `@Nome` das menções
 * confirmadas. O textarea fica com texto transparente e caret visível.
 */
export function ComposerMentionHighlight({
  texto,
  mencoes,
}: {
  texto: string
  mencoes: MencaoParsed[]
}) {
  if (!texto) {
    return <span className="invisible">.</span>
  }

  const sorted = [...mencoes].sort((a, b) => b.nome.length - a.nome.length)
  if (sorted.length === 0) {
    return <>{texto}</>
  }

  const pattern = sorted
    .map((m) => `@${escapeRegExp(m.nome)}(?![\\p{L}\\p{N}_])`)
    .join('|')
  const re = new RegExp(`(${pattern})`, 'gu')
  const parts = texto.split(re)

  return (
    <>
      {parts.map((part, i) => {
        const isMention = sorted.some((m) => part === `@${m.nome}`)
        if (isMention) {
          return (
            <span
              key={`m-${i}`}
              className="rounded-[0.2em] bg-[rgb(var(--color-primary)_/_0.18)] font-semibold text-[rgb(var(--color-primary-fg))]"
            >
              {part}
            </span>
          )
        }
        return <span key={`t-${i}`}>{part}</span>
      })}
    </>
  )
}
