'use client'

import { useVirtualizer } from '@tanstack/react-virtual'

const DEFAULT_ESTIMATE_PX = 76
const DEFAULT_OVERSCAN = 10
const DEFAULT_THRESHOLD = 48

/**
 * Windowing da thread de mensagens (scroll do container, não da janela).
 * Abaixo do threshold renderiza a lista completa.
 *
 * O lint acusa "Compilation Skipped: Use of incompatible library" aqui: o
 * `useVirtualizer` do @tanstack/react-virtual mede e muta durante o render, e o
 * React Compiler desiste de otimizar este hook. É bailout informativo, não bug
 * — o hook funciona igual, só não é memoizado pelo compilador. Não silenciar:
 * some sozinho quando a lib for compatível (ou quando trocarmos o windowing).
 */
export function useMensagemListWindow(
  itemCount: number,
  getScrollElement: () => HTMLElement | null,
  options?: { estimatePx?: number; overscan?: number; threshold?: number },
) {
  const estimatePx = options?.estimatePx ?? DEFAULT_ESTIMATE_PX
  const overscan = options?.overscan ?? DEFAULT_OVERSCAN
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD
  const enabled = itemCount >= threshold

  const virtualizer = useVirtualizer({
    count: enabled ? itemCount : 0,
    getScrollElement,
    estimateSize: () => estimatePx,
    overscan,
  })

  if (!enabled) {
    return {
      enabled: false as const,
      virtualItems: null,
      totalSize: 0,
      measureElement: undefined as undefined,
    }
  }

  return {
    enabled: true as const,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  }
}
