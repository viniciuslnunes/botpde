'use client'

import { useWindowVirtualizer } from '@tanstack/react-virtual'

const DEFAULT_ESTIMATE_PX = 420
const DEFAULT_OVERSCAN = 3

/**
 * Windowing do feed via @tanstack/react-virtual (scroll da janela).
 * Abaixo de 24 itens renderiza a lista completa (sem virtualizar).
 */
export function useFeedWindow(
  itemCount: number,
  options?: { estimatePx?: number; overscan?: number; enabled?: boolean },
) {
  const estimatePx = options?.estimatePx ?? DEFAULT_ESTIMATE_PX
  const overscan = options?.overscan ?? DEFAULT_OVERSCAN
  const enabled = options?.enabled ?? itemCount > 24

  const virtualizer = useWindowVirtualizer({
    count: enabled ? itemCount : 0,
    estimateSize: () => estimatePx,
    overscan,
  })

  if (!enabled) {
    return {
      enabled: false as const,
      virtualItems: null,
      totalSize: 0,
      measureElement: undefined as undefined,
      /** Fallback: slice completo */
      start: 0,
      end: itemCount,
      topSpacer: 0,
      bottomSpacer: 0,
      estimatePx,
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  return {
    enabled: true as const,
    virtualItems,
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
    start: virtualItems[0]?.index ?? 0,
    end: (virtualItems[virtualItems.length - 1]?.index ?? -1) + 1,
    topSpacer: 0,
    bottomSpacer: 0,
    estimatePx,
  }
}
