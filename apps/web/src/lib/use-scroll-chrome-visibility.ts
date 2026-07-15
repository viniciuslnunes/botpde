'use client'

import { useEffect, useState } from 'react'

type Options = {
  /** Distância mínima de scroll para considerar mudança de direção. */
  thresholdPx?: number
  /** Abaixo disso (topo da página), o chrome permanece visível. */
  topRevealPx?: number
  /** Sem eventos de scroll — esconde (exceto no topo). */
  idleHideMs?: number
}

/**
 * Chrome sticky/flutuante no padrão social:
 * — scroll pra cima → aparece
 * — scroll pra baixo ou parado → some
 * — no topo da página → sempre visível
 */
export function useScrollChromeVisibility(options: Options = {}): boolean {
  const thresholdPx = options.thresholdPx ?? 8
  const topRevealPx = options.topRevealPx ?? 48
  const idleHideMs = options.idleHideMs ?? 900

  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    let idleTimer: number | undefined

    function applyVisibility(y: number, delta: number) {
      if (y <= topRevealPx) {
        setVisible(true)
        return
      }
      if (delta < -thresholdPx) {
        setVisible(true)
        return
      }
      if (delta > thresholdPx) {
        setVisible(false)
      }
    }

    function scheduleIdleHide(y: number) {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer)
      if (y <= topRevealPx) return
      idleTimer = window.setTimeout(() => {
        if (window.scrollY > topRevealPx) setVisible(false)
      }, idleHideMs)
    }

    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastY
        applyVisibility(y, delta)
        lastY = y
        ticking = false
        scheduleIdleHide(y)
      })
    }

    // Estado inicial (SSR = visível; sincroniza após hydrate).
    if (window.scrollY > topRevealPx) setVisible(false)

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (idleTimer !== undefined) window.clearTimeout(idleTimer)
    }
  }, [thresholdPx, topRevealPx, idleHideMs])

  return visible
}
