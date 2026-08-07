'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const TIP_GAP_PX = 8
const TIP_EDGE_PX = 10
const CARET_HALF_PX = 5

export type HoverTipAnchor = {
  title: string
  /** Linha secundária (ex.: “Arraste para reposicionar”). */
  hint?: string
  left: number
  top: number
  width: number
  height: number
}

/** Lê o retângulo do âncora para o portal do tip. */
export function hoverTipFromElement(
  content: string | { title: string; hint?: string },
  el: HTMLElement,
): HoverTipAnchor | null {
  const title = (typeof content === 'string' ? content : content.title).trim()
  const hint =
    typeof content === 'string' ? undefined : content.hint?.trim() || undefined
  if (!title) return null
  const r = el.getBoundingClientRect()
  return {
    title,
    hint,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  }
}

type TipCoords = {
  left: number
  top: number
  above: boolean
  caretLeft: number
}

/**
 * Tooltip em portal — nome completo quando o layout só mostra ícone/truncado.
 * Título + dica opcional; setinha alinhada ao ícone mesmo perto da borda.
 */
export function HoverTip({
  tip,
  variant = 'default',
}: {
  tip: HoverTipAnchor | null
  variant?: 'default' | 'super-admin'
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<TipCoords | null>(null)

  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      setCoords(null)
      return
    }

    const el = tipRef.current
    const tipW = el.offsetWidth
    const tipH = el.offsetHeight
    const anchorX = tip.left + tip.width / 2
    const above = tip.top > 72

    let left = anchorX - tipW / 2
    left = Math.min(
      Math.max(left, TIP_EDGE_PX),
      Math.max(TIP_EDGE_PX, window.innerWidth - TIP_EDGE_PX - tipW),
    )

    const caretLeft = Math.min(
      Math.max(anchorX - left, CARET_HALF_PX + 6),
      tipW - CARET_HALF_PX - 6,
    )

    const top = above ? tip.top - TIP_GAP_PX - tipH : tip.top + tip.height + TIP_GAP_PX

    setCoords({ left, top, above, caretLeft })
  }, [tip])

  if (typeof document === 'undefined' || !tip) return null

  const isSuper = variant === 'super-admin'
  const shell = isSuper
    ? 'border-zinc-600/80 bg-zinc-950/95 text-zinc-50 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.8)]'
    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 text-[rgb(var(--foreground))] shadow-[0_14px_36px_-14px_rgba(0,0,0,0.35)]'
  const caret = isSuper
    ? 'bg-zinc-950 border-zinc-600/80'
    : 'bg-[rgb(var(--surface))] border-[rgb(var(--border))]'

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      className={[
        'pointer-events-none fixed z-[200] w-max max-w-[min(16rem,calc(100vw-1.25rem))]',
        'motion-safe:animate-[hover-tip-in_120ms_ease-out]',
        coords ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      style={
        coords
          ? { left: coords.left, top: coords.top }
          : {
              // Medição off-screen — evita flash no canto.
              left: -9999,
              top: 0,
              visibility: 'hidden',
            }
      }
    >
      <div
        className={`relative rounded-xl border px-2.5 py-1.5 backdrop-blur-md ${shell}`}
      >
        <p className="text-pretty text-[12px] font-semibold leading-snug tracking-tight">
          {tip.title}
        </p>
        {tip.hint ? (
          <p className="mt-0.5 text-[10px] font-medium leading-snug tracking-wide text-[rgb(var(--foreground-muted))]">
            {tip.hint}
          </p>
        ) : null}
        {coords ? (
          <span
            aria-hidden
            className={`absolute h-2 w-2 rotate-45 border ${caret} ${
              coords.above
                ? 'bottom-[-4px] border-l-0 border-t-0'
                : 'top-[-4px] border-b-0 border-r-0'
            }`}
            style={{ left: coords.caretLeft, marginLeft: -4 }}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
