'use client'

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useHidratado } from '@/lib/use-hidratado'

export type AnchoredPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

interface AnchoredPopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  placement?: AnchoredPlacement
  offset?: number
  /** Largura mínima do painel (px). */
  minWidth?: number
  /** Se true, a largura segue o âncora (útil em menções). */
  matchAnchorWidth?: boolean
  /** Largura máxima (px). Evita painel largo demais no composer. */
  maxWidth?: number
  /**
   * Limita a altura ao espaço do viewport e só então habilita scroll.
   * Menus curtos (3 pontos, extras) deixam `false` — `max-height` + overflow
   * cria scrollbar fantasma no Windows mesmo com 1 item.
   */
  constrainHeight?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
  zIndex?: number
}

interface Coords {
  top: number
  left: number
  width?: number
  maxHeight?: number
  transform?: string
}

function medir(
  anchor: HTMLElement,
  placement: AnchoredPlacement,
  offset: number,
  opts: {
    minWidth?: number
    matchAnchorWidth?: boolean
    maxWidth?: number
    constrainHeight: boolean
  },
): Coords {
  const rect = anchor.getBoundingClientRect()
  let width = opts.matchAnchorWidth
    ? Math.max(opts.minWidth ?? 0, rect.width)
    : opts.minWidth
  if (width != null && opts.maxWidth != null) {
    width = Math.min(width, opts.maxWidth)
  }

  let top: number
  let left: number
  let transform: string | undefined
  let preferBottom = placement.startsWith('bottom')

  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - offset - 8)
  const spaceAbove = Math.max(0, rect.top - offset - 8)

  if (preferBottom && spaceBelow < 160 && spaceAbove > spaceBelow) {
    preferBottom = false
  } else if (!preferBottom && spaceAbove < 160 && spaceBelow > spaceAbove) {
    preferBottom = true
  }

  if (preferBottom) {
    top = rect.bottom + offset
    transform = placement.endsWith('end') ? 'translateX(-100%)' : undefined
  } else {
    top = rect.top - offset
    transform = placement.endsWith('end') ? 'translate(-100%, -100%)' : 'translateY(-100%)'
  }

  left = placement.endsWith('end') ? rect.right : rect.left

  const paneWidth = width ?? 288
  const maxLeft = window.innerWidth - paneWidth - 8
  if (!transform?.includes('translateX') && !transform?.includes('translate(-100%')) {
    left = Math.max(8, Math.min(left, maxLeft))
  } else {
    const estimatedLeft = left - paneWidth
    if (estimatedLeft < 8) left = 8 + paneWidth
    if (left > window.innerWidth - 8) left = window.innerWidth - 8
  }

  const available = preferBottom ? spaceBelow : spaceAbove
  const maxHeight = opts.constrainHeight
    ? Math.max(80, Math.min(available, Math.floor(window.innerHeight * 0.5), 288))
    : undefined

  return { top, left, width, maxHeight, transform }
}

function coordsIguais(a: Coords | null, b: Coords): boolean {
  if (!a) return false
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight &&
    a.transform === b.transform
  )
}

/**
 * Renderiza o painel em `document.body` com `position: fixed`, escapando de
 * qualquer `overflow` ancestral (composer, AnimatePresence, chrome sticky).
 *
 * Scroll **dentro** do painel não reposiciona (evita resetar o scroll da lista).
 */
export function AnchoredPopover({
  open,
  anchorRef,
  placement = 'bottom-start',
  offset = 8,
  minWidth,
  matchAnchorWidth = false,
  maxWidth,
  constrainHeight = false,
  className,
  style,
  children,
  zIndex = 50,
}: AnchoredPopoverProps) {
  const mounted = useHidratado()
  const [coords, setCoords] = useState<Coords | null>(null)
  const [needsScroll, setNeedsScroll] = useState(false)
  const portalRef = useRef<HTMLDivElement>(null)

  const atualizar = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const next = medir(anchor, placement, offset, {
      minWidth,
      matchAnchorWidth,
      maxWidth,
      constrainHeight,
    })
    setCoords((prev) => (coordsIguais(prev, next) ? prev : next))
  }, [anchorRef, placement, offset, minWidth, matchAnchorWidth, maxWidth, constrainHeight])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      setNeedsScroll(false)
      return
    }
    atualizar()

    function onScroll(e: Event) {
      const target = e.target
      // Scroll da própria lista do menu — não reposicionar (senão o scroll
      // interno “quebra” / volta pro topo a cada frame).
      if (
        target instanceof Node &&
        portalRef.current &&
        (target === portalRef.current || portalRef.current.contains(target))
      ) {
        return
      }
      atualizar()
    }

    window.addEventListener('resize', atualizar)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', atualizar)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, atualizar])

  // Só liga overflow-y quando o conteúdo de fato passa do teto — evita
  // scrollbar fantasma (Windows “sempre mostrar barras” + max-height).
  useLayoutEffect(() => {
    if (!open || !constrainHeight || !coords?.maxHeight) {
      setNeedsScroll(false)
      return
    }
    const el = portalRef.current
    if (!el) return
    setNeedsScroll(el.scrollHeight > el.clientHeight + 1)
  }, [open, constrainHeight, coords, children])

  if (!open || !mounted || !coords) return null

  return createPortal(
    <div
      ref={portalRef}
      className={['app-scrollbar-fina min-w-0', className].filter(Boolean).join(' ')}
      data-anchored-popover=""
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        transform: coords.transform,
        zIndex,
        // `clip` (não `hidden`) no eixo X: não força overflow-y:auto.
        overflowX: 'clip',
        overflowY: needsScroll ? 'auto' : 'visible',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
