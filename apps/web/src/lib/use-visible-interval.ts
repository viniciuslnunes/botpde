'use client'

import { useEffect, useRef } from 'react'

/** setInterval que só executa quando a aba está visível. */
export function useVisibleInterval(callback: () => void, intervalMs: number): void {
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible') callback()
    }
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [callback, intervalMs])
}

/**
 * Polling com backoff: roda `callback` a cada `baseMs` enquanto houver atividade
 * (callback resolve `true`); sem atividade, dobra o intervalo até `maxMs`.
 * Só executa com a aba visível. Retorna um `reset` para voltar ao ritmo base
 * imediatamente (ex.: após o usuário enviar uma mensagem).
 */
export function useVisibleBackoffInterval(
  callback: () => Promise<boolean> | boolean,
  baseMs: number,
  maxMs: number,
): { reset: () => void } {
  const callbackRef = useRef(callback)
  const delayRef = useRef(baseMs)
  const resetRef = useRef<() => void>(() => {})

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    let cancelled = false
    let timerId: number | undefined

    function schedule(delay: number) {
      timerId = window.setTimeout(run, delay)
    }

    async function run() {
      if (cancelled) return
      if (document.visibilityState !== 'visible') {
        schedule(delayRef.current)
        return
      }
      let houveAtividade = false
      try {
        houveAtividade = await callbackRef.current()
      } catch {
        // polling silencioso
      }
      if (cancelled) return
      delayRef.current = houveAtividade ? baseMs : Math.min(delayRef.current * 2, maxMs)
      schedule(delayRef.current)
    }

    resetRef.current = () => {
      delayRef.current = baseMs
      if (timerId !== undefined) window.clearTimeout(timerId)
      if (!cancelled) schedule(baseMs)
    }

    delayRef.current = baseMs
    schedule(baseMs)
    return () => {
      cancelled = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [baseMs, maxMs])

  return { reset: () => resetRef.current() }
}
