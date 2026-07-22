'use client'

import { useEffect } from 'react'

const STORED_HREF_ATTR = 'data-stored-href'

function restoreHref(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute(STORED_HREF_ATTR)
  if (!href) return
  anchor.setAttribute('href', href)
  anchor.removeAttribute(STORED_HREF_ATTR)
}

function hideHref(anchor: HTMLAnchorElement) {
  if (anchor.hasAttribute(STORED_HREF_ATTR)) return
  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('javascript:')) return
  anchor.setAttribute(STORED_HREF_ATTR, href)
  anchor.removeAttribute('href')
}

/**
 * Evita que o navegador mostre a URL no canto inferior ao passar o mouse em links.
 * Restaura o href antes do clique para não quebrar navegação, abrir em nova aba etc.
 */
export function LinkStatusBarSuppressor() {
  useEffect(() => {
    const onMouseOver = (event: MouseEvent) => {
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
      document.removeEventListener('mouseover', onMouseOver, true)
      document.removeEventListener('mouseout', onMouseOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  return null
}
