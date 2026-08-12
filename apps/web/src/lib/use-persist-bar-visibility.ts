'use client'

import { useEffect, useState } from 'react'

type Options = {
  /**
   * Quando true (alterações pendentes, submit em andamento, foco na barra),
   * a barra permanece visível — o usuário precisa conseguir salvar.
   */
  locked?: boolean
  /** Sem scroll — esconde (exceto se `locked`). */
  idleHideMs?: number
  /** Distância mínima de scroll para considerar atividade. */
  thresholdPx?: number
}

/**
 * Visibilidade da barra de persistência (Salvar / Cancelar) flutuante.
 *
 * Regra (admin / departamentos / loja / onboarding — não comunidade):
 * — sem alterações: começa oculta; scroll → aparece; idle ou clique fora → some
 * — `locked` (dirty / pending / foco) → sempre visível
 * — ao sair de `locked` (salvar / descartar / reverter ao baseline) → some na hora
 *   (não permanece no estado “cinza” com botões disabled)
 *
 * Scroll: listeners `passive` + rAF (mesmo padrão de `useScrollChromeVisibility`).
 */
export function usePersistBarVisibility(options: Options = {}): boolean {
  const locked = options.locked ?? false
  const idleHideMs = options.idleHideMs ?? 1800
  const thresholdPx = options.thresholdPx ?? 8

  // Sem flash no load: só aparece após scroll. `locked` some por cima disso no
  // retorno — não precisa (nem deve) virar setState.
  const [visible, setVisible] = useState(false)

  // Saiu do locked: esconde imediatamente. Sem isso a barra fica no visual
  // “unlocked” (borda neutra, hint/atalho sumidos, CTAs disabled) até idle/clique.
  // No render, porque um frame nesse estado já é o defeito que a regra descreve.
  const [lockedAnterior, setLockedAnterior] = useState(locked)
  if (locked !== lockedAnterior) {
    setLockedAnterior(locked)
    if (!locked) setVisible(false)
  }

  useEffect(() => {
    if (locked) return

    let lastY = window.scrollY
    let ticking = false
    let idleTimer: number | undefined

    function clearIdle() {
      if (idleTimer !== undefined) {
        window.clearTimeout(idleTimer)
        idleTimer = undefined
      }
    }

    function scheduleIdleHide() {
      clearIdle()
      idleTimer = window.setTimeout(() => {
        setVisible(false)
      }, idleHideMs)
    }

    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = Math.abs(y - lastY)
        lastY = y
        ticking = false
        if (delta < thresholdPx) return
        setVisible(true)
        scheduleIdleHide()
      })
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-persist-bar]')) return
      if (target.closest('[data-persist-bar-root]')) return
      // Diálogos / menus: não tratar como “clique na tela” de dismiss.
      if (target.closest('[aria-modal="true"], [role="dialog"], [data-radix-popper-content-wrapper]')) {
        return
      }
      setVisible(false)
      clearIdle()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { capture: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      clearIdle()
    }
  }, [locked, idleHideMs, thresholdPx])

  return locked || visible
}
