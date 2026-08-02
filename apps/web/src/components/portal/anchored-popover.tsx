'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

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
  className?: string
  style?: CSSProperties
  children: ReactNode
  zIndex?: number
}

interface Coords {
  top: number
  left: number
  width?: number
  transform?: string
}

function medir(
  anchor: HTMLElement,
  placement: AnchoredPlacement,
  offset: number,
  opts: { minWidth?: number; matchAnchorWidth?: boolean },
): Coords {
  const rect = anchor.getBoundingClientRect()
  const width = opts.matchAnchorWidth
    ? Math.max(opts.minWidth ?? 0, rect.width)
    : opts.minWidth

  let top: number
  let left: number
  let transform: string | undefined

  if (placement.startsWith('top')) {
    top = rect.top - offset
    transform = placement.endsWith('end') ? 'translate(-100%, -100%)' : 'translateY(-100%)'
  } else {
    top = rect.bottom + offset
    transform = placement.endsWith('end') ? 'translateX(-100%)' : undefined
  }

  left = placement.endsWith('end') ? rect.right : rect.left

  // Mantém o painel dentro da viewport horizontalmente.
  const paneWidth = width ?? 288
  const maxLeft = window.innerWidth - paneWidth - 8
  if (!transform?.includes('translateX') && !transform?.includes('translate(-100%')) {
    left = Math.max(8, Math.min(left, maxLeft))
  } else {
    // Alinhado à direita: garante que a borda esquerda não saia da tela.
    const estimatedLeft = left - paneWidth
    if (estimatedLeft < 8) left = 8 + paneWidth
    if (left > window.innerWidth - 8) left = window.innerWidth - 8
  }

  // Flip vertical se não couber na direção preferida.
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const needFlipBottom = placement.startsWith('bottom') && spaceBelow < 160 && spaceAbove > spaceBelow
  const needFlipTop = placement.startsWith('top') && spaceAbove < 160 && spaceBelow > spaceAbove

  if (needFlipBottom) {
    top = rect.top - offset
    transform = placement.endsWith('end') ? 'translate(-100%, -100%)' : 'translateY(-100%)'
  } else if (needFlipTop) {
    top = rect.bottom + offset
    transform = placement.endsWith('end') ? 'translateX(-100%)' : undefined
  }

  return { top, left, width, transform }
}

/**
 * Renderiza o painel em `document.body` com `position: fixed`, escapando de
 * qualquer `overflow` ancestral (composer, AnimatePresence, chrome sticky).
 */
export function AnchoredPopover({
  open,
  anchorRef,
  placement = 'bottom-start',
  offset = 8,
  minWidth,
  matchAnchorWidth = false,
  className,
  style,
  children,
  zIndex = 50,
}: AnchoredPopoverProps) {
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const atualizar = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    setCoords(medir(anchor, placement, offset, { minWidth, matchAnchorWidth }))
  }, [anchorRef, placement, offset, minWidth, matchAnchorWidth])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    atualizar()
    window.addEventListener('resize', atualizar)
    window.addEventListener('scroll', atualizar, true)
    return () => {
      window.removeEventListener('resize', atualizar)
      window.removeEventListener('scroll', atualizar, true)
    }
  }, [open, atualizar])

  if (!open || !mounted || !coords) return null

  return createPortal(
    <div
      className={className}
      data-anchored-popover=""
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        transform: coords.transform,
        zIndex,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
