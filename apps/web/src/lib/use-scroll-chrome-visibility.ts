'use client'

import { useEffect, useState } from 'react'
import { useHidratado } from '@/lib/use-hidratado'

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

  // O SSR não conhece a posição do scroll, então o chrome nasce visível. Se a
  // página já abre rolada (voltar do histórico, âncora), corrige no primeiro
  // render pós-hidratação — antes isso era um setState no corpo do effect,
  // que só aplicava depois de um frame com o chrome indevidamente visível.
  const hidratado = useHidratado()
  const [inicialAplicado, setInicialAplicado] = useState(false)
  if (hidratado && !inicialAplicado) {
    setInicialAplicado(true)
    if (window.scrollY > topRevealPx) setVisible(false)
  }

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    let idleTimer: number | undefined
    let lastFlipAt = 0
    // Evita oscilar (e reanimar) a cada micro-reversão de direção em scroll
    // não-monotônico (comum em touch/trackpad) — sem isso, cada pequeno
    // "solavanco" refaz a animação de altura do chrome sticky, forçando
    // reflow do feed abaixo em sequência e travando o scroll.
    const minFlipIntervalMs = 250

    function applyVisibility(y: number, delta: number, now: number) {
      if (y <= topRevealPx) {
        lastFlipAt = now
        setVisible(true)
        return
      }
      if (now - lastFlipAt < minFlipIntervalMs) return
      if (delta < -thresholdPx) {
        lastFlipAt = now
        setVisible(true)
        return
      }
      if (delta > thresholdPx) {
        lastFlipAt = now
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
        applyVisibility(y, delta, performance.now())
        lastY = y
        ticking = false
        scheduleIdleHide(y)
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (idleTimer !== undefined) window.clearTimeout(idleTimer)
    }
  }, [thresholdPx, topRevealPx, idleHideMs])

  return visible
}
