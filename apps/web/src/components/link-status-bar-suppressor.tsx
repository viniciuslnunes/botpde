'use client'

import { useEffect } from 'react'

const STORED_HREF_ATTR = 'data-stored-href'

function restoreHref(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute(STORED_HREF_ATTR)
  if (!href) return
  anchor.setAttribute('href', href)
  anchor.removeAttribute(STORED_HREF_ATTR)
}

function restoreAllSuppressed() {
  document.querySelectorAll<HTMLAnchorElement>(`a[${STORED_HREF_ATTR}]`).forEach(restoreHref)
}

/** Nó ainda não reivindicado pelo React — mutar o DOM quebra a hidratação. */
function isClaimedByReact(node: Element): boolean {
  return Object.keys(node).some(
    (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$'),
  )
}

function shouldSkipSuppression(anchor: HTMLAnchorElement): boolean {
  if (anchor.hasAttribute('data-status-bar-keep')) return true
  // Links de prefetch da Comunidade — costumam hidratar depois do layout (Suspense).
  if (anchor.hasAttribute('data-cursor-action')) return true
  return !isClaimedByReact(anchor)
}

function hideHref(anchor: HTMLAnchorElement) {
  if (shouldSkipSuppression(anchor)) return
  if (anchor.hasAttribute(STORED_HREF_ATTR)) return
  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('javascript:')) return
  anchor.setAttribute(STORED_HREF_ATTR, href)
  anchor.removeAttribute('href')
}

/**
 * Evita que o navegador mostre a URL no canto inferior ao passar o mouse em links.
 * Restaura o href antes do clique para não quebrar navegação, abrir em nova aba etc.
 *
 * Só age em âncoras já hidratadas pelo React — mutar `href` antes da hidratação
 * (comum em conteúdo dentro de Suspense) gera mismatch server/client.
 */
export function LinkStatusBarSuppressor() {
  useEffect(() => {
    restoreAllSuppressed()

    let armed = false
    const armId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        armed = true
      })
    })

    const onMouseOver = (event: MouseEvent) => {
      if (!armed) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]')
      if (anchor instanceof HTMLAnchorElement) hideHref(anchor)
    }

    const onMouseOut = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.(`a[${STORED_HREF_ATTR}]`)
      if (!(anchor instanceof HTMLAnchorElement)) return
      const related = event.relatedTarget
      if (related instanceof Node && anchor.contains(related)) return
      restoreHref(anchor)
    }

    const onPointerDown = (event: PointerEvent) => {
      const anchor = (event.target as Element | null)?.closest?.(`a[${STORED_HREF_ATTR}]`)
      if (anchor instanceof HTMLAnchorElement) restoreHref(anchor)
    }

    document.addEventListener('mouseover', onMouseOver, true)
    document.addEventListener('mouseout', onMouseOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      window.cancelAnimationFrame(armId)
      document.removeEventListener('mouseover', onMouseOver, true)
      document.removeEventListener('mouseout', onMouseOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      restoreAllSuppressed()
    }
  }, [])

  return null
}
