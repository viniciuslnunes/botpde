'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual'

const DEFAULT_ESTIMATE_PX = 420
const DEFAULT_OVERSCAN = 3
const DEFAULT_THRESHOLD_ITEMS = 24

type Medicoes = {
  /** Semente de `itemSizeCache` (o core lê só `key` + `size`). */
  cache: VirtualItem[]
  /** Média real medida — estimativa das páginas ainda não renderizadas. */
  media: number
}

/**
 * Windowing do feed via @tanstack/react-virtual (scroll da janela).
 * Abaixo de 24 itens renderiza a lista completa (sem virtualizar).
 *
 * Três invariantes que, quebradas, colocam a página em loop de sobe/desce
 * (sintoma visível: o rail sticky da esquerda "pulando"):
 *
 * 1. **`scrollMargin`** — a lista não começa no topo do documento (acima dela
 *    há tabs, banners, barra sticky, stories e composer). Sem informar essa
 *    distância, o range visível e os offsets ficam deslocados, as medições
 *    realimentam `getTotalSize()` e a altura do documento oscila. Posicione os
 *    itens com `item.start - scrollMargin`.
 * 2. **Troca de modo sem salto** — a virtualização liga no meio do scroll,
 *    quando a 2ª página chega. Se os itens já renderizados não forem medidos
 *    antes da troca, o container passa a valer `count × estimativa` e a altura
 *    do documento pula de uma vez. Por isso lemos o DOM real (`data-index`) no
 *    layout effect e semeamos `initialMeasurementsCache` + a estimativa média.
 * 3. **Item medido não pode ter `content-visibility: auto`** (`.feed-post-window`)
 *    — fora da viewport o elemento reporta o tamanho intrínseco, o
 *    `ResizeObserver` do `measureElement` registra esse valor falso e o total
 *    oscila. Virtualizando, o windowing nativo é redundante: use
 *    `windowing.postClassName`.
 *
 * O modo também é **latch**: uma vez virtualizado, não volta atrás (remoção de
 * post cruzando o limiar não deve remontar a lista inteira).
 *
 * `listRef` vem de fora (e não do retorno) para o container ficar com um ref
 * simples no JSX — devolver o ref junto faria o lint do React Compiler tratar
 * todo acesso ao objeto de retorno como leitura de ref durante o render.
 */
export function useFeedWindow(
  itemCount: number,
  options: {
    /** Container dos itens — origem do `scrollMargin` e das medições iniciais. */
    listRef: React.RefObject<HTMLDivElement | null>
    estimatePx?: number
    overscan?: number
    enabled?: boolean
    thresholdItems?: number
  },
) {
  const { listRef } = options
  const estimatePx = options?.estimatePx ?? DEFAULT_ESTIMATE_PX
  const overscan = options?.overscan ?? DEFAULT_OVERSCAN
  const thresholdItems = options?.thresholdItems ?? DEFAULT_THRESHOLD_ITEMS
  const permitido = options?.enabled ?? true

  const [scrollMargin, setScrollMargin] = useState(0)
  const [medicoes, setMedicoes] = useState<Medicoes | null>(null)
  const [ligado, setLigado] = useState(false)

  const enabled = permitido && (ligado || itemCount > thresholdItems)

  const medirScrollMargin = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    // Guarda de 1px: evita setState em ruído de subpixel (o ResizeObserver
    // dispara a cada página carregada, quando só a altura da lista muda).
    setScrollMargin((prev) => (Math.abs(prev - top) > 1 ? top : prev))
  }, [listRef])

  /** Lê as alturas reais dos itens já em fluxo normal, antes de virtualizar. */
  const lerMedicoesDoDom = useCallback((): Medicoes | null => {
    const el = listRef.current
    if (!el) return null

    const cache: VirtualItem[] = []
    let soma = 0
    for (const node of el.querySelectorAll<HTMLElement>('[data-index]')) {
      const index = Number(node.dataset.index)
      const size = node.getBoundingClientRect().height
      if (!Number.isInteger(index) || size <= 0) continue
      soma += size
      cache.push({ index, key: index, size, start: 0, end: size, lane: 0 })
    }

    if (cache.length === 0) return null
    return { cache, media: Math.round(soma / cache.length) }
  }, [listRef])

  useLayoutEffect(() => {
    medirScrollMargin()
  }, [medirScrollMargin, enabled])

  useLayoutEffect(() => {
    if (ligado || !permitido || itemCount <= thresholdItems) return
    // Roda no commit anterior ao primeiro render virtualizado: mede o que já
    // está em fluxo normal e só então liga. O setState aqui é intencional —
    // re-render síncrono antes do paint, sem frame intermediário visível.
    const medido = lerMedicoesDoDom()
    /* eslint-disable react-hooks/set-state-in-effect -- medir-então-ligar tem de
       acontecer no mesmo commit, antes do paint; é justamente o que evita o
       salto de altura na troca de modo. */
    if (medido) setMedicoes(medido)
    setLigado(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ligado, permitido, itemCount, thresholdItems, lerMedicoesDoDom])

  useEffect(() => {
    if (!enabled) return
    const el = listRef.current
    if (!el) return

    // Qualquer mudança de altura acima da lista (composer, stories, banner
    // live, chrome sticky) desloca o topo dela — remede nesses casos.
    const observer = new ResizeObserver(medirScrollMargin)
    observer.observe(document.body)
    window.addEventListener('resize', medirScrollMargin)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', medirScrollMargin)
    }
  }, [enabled, listRef, medirScrollMargin])

  const estimativa = medicoes?.media ?? estimatePx

  const virtualizer = useWindowVirtualizer({
    count: enabled ? itemCount : 0,
    estimateSize: () => estimativa,
    overscan,
    scrollMargin,
    initialMeasurementsCache: medicoes?.cache,
  })

  if (!enabled) {
    return {
      enabled: false as const,
      scrollMargin: 0,
      virtualItems: null,
      totalSize: 0,
      measureElement: undefined as undefined,
      /** Windowing nativo do CSS enquanto a virtualização está desligada. */
      postClassName: 'feed-post-window',
      /** Fallback: slice completo */
      start: 0,
      end: itemCount,
      topSpacer: 0,
      bottomSpacer: 0,
      estimatePx: estimativa,
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  return {
    enabled: true as const,
    scrollMargin,
    virtualItems,
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
    postClassName: undefined,
    start: virtualItems[0]?.index ?? 0,
    end: (virtualItems[virtualItems.length - 1]?.index ?? -1) + 1,
    topSpacer: 0,
    bottomSpacer: 0,
    estimatePx: estimativa,
  }
}
