'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_ESTIMATE_PX = 420
const DEFAULT_OVERSCAN = 3

function computeRange(
  itemCount: number,
  estimatePx: number,
  overscan: number,
): { start: number; end: number } {
  if (itemCount === 0) return { start: 0, end: 0 }

  const scrollTop = typeof window !== 'undefined' ? window.scrollY : 0
  const viewport = typeof window !== 'undefined' ? window.innerHeight : 800
  const start = Math.max(0, Math.floor(scrollTop / estimatePx) - overscan)
  const end = Math.min(itemCount, Math.ceil((scrollTop + viewport) / estimatePx) + overscan)
  return { start, end }
}

/**
 * Windowing leve para listas longas sem dependência externa.
 * Renderiza só o recorte visível + overscan; usa altura estimada por item.
 */
export function useFeedWindow(
  itemCount: number,
  options?: { estimatePx?: number; overscan?: number; enabled?: boolean },
) {
  const estimatePx = options?.estimatePx ?? DEFAULT_ESTIMATE_PX
  const overscan = options?.overscan ?? DEFAULT_OVERSCAN
  const enabled = options?.enabled ?? itemCount > 24

  const [scrollRange, setScrollRange] = useState(() =>
    enabled ? computeRange(itemCount, estimatePx, overscan) : { start: 0, end: itemCount },
  )
  const rafRef = useRef<number | null>(null)

  const updateRange = useCallback(() => {
    setScrollRange((prev) => {
      const next = computeRange(itemCount, estimatePx, overscan)
      return prev.start === next.start && prev.end === next.end ? prev : next
    })
  }, [estimatePx, itemCount, overscan])

  useEffect(() => {
    if (!enabled) return

    const onScroll = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        updateRange()
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, updateRange])

  const { start, end } = useMemo(() => {
    if (!enabled) return { start: 0, end: itemCount }
    return {
      start: Math.min(scrollRange.start, itemCount),
      end: Math.min(Math.max(scrollRange.end, 1), itemCount),
    }
  }, [enabled, itemCount, scrollRange])

  const topSpacer = enabled ? start * estimatePx : 0
  const bottomSpacer = enabled ? Math.max(0, (itemCount - end) * estimatePx) : 0

  return {
    enabled,
    start,
    end,
    topSpacer,
    bottomSpacer,
    estimatePx,
  }
}
