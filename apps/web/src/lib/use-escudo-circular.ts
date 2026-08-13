'use client'

import { useLayoutEffect, useState } from 'react'
import {
  detectarEscudoCircular,
  lerCacheEscudoCircular,
  subscribeEscudoCircular,
} from '@/lib/escudo-forma'
import { useHidratado } from '@/lib/use-hidratado'

export type EscudoCircularShape = 'auto' | 'circle' | 'rounded'

/**
 * Fonte única da máscara circular de escudo/logo.
 *
 * Cache síncrono (memória + localStorage) + assinatura: quando qualquer
 * instância termina a detecção, todas as outras com a mesma URL atualizam
 * sem reprocessar. Fundo opaco assado (branco, preto/#0a0a0a do crop, cor)
 * com badge redondo → `circular`; PNG com alpha nos cantos → não mascara.
 */
export function useEscudoCircular(
  src: string | null | undefined,
  shape: EscudoCircularShape = 'auto',
): { circular: boolean; pronto: boolean } {
  const hidratado = useHidratado()

  // Resposta imediata quando não depende de detecção: sem src, shape fixo, ou
  // cache já quente. Antes isso era decidido dentro do layout effect, o que
  // custava um render extra e caía em `react-hooks/set-state-in-effect`.
  const imediato: { circular: boolean; pronto: boolean } | null = !src
    ? { circular: false, pronto: true }
    : shape === 'circle'
      ? { circular: true, pronto: true }
      : shape === 'rounded'
        ? { circular: false, pronto: true }
        : null

  /** Resultado da detecção assíncrona, carimbado com a URL que o gerou. */
  const [detectado, setDetectado] = useState<{ src: string; circular: boolean } | null>(null)

  useLayoutEffect(() => {
    if (!src || shape !== 'auto') return

    let ativo = true
    const unsub = subscribeEscudoCircular((url, valor) => {
      if (!ativo || url !== src) return
      setDetectado({ src, circular: valor })
    })

    if (lerCacheEscudoCircular(src) === null) {
      void detectarEscudoCircular(src).catch(() => {
        if (!ativo) return
        setDetectado({ src, circular: false })
      })
    }

    return () => {
      ativo = false
      unsub()
    }
  }, [src, shape])

  if (imediato) return imediato

  // Cache quente (memória + localStorage) só existe no browser. Ler no SSR
  // deixava o HTML com skeleton e o 1º paint do client com <img> — mismatch
  // de hidratação no LogoMiniatura da navbar.
  const cache = hidratado && src ? lerCacheEscudoCircular(src) : null
  if (cache !== null) return { circular: cache, pronto: true }
  if (detectado && detectado.src === src) {
    return { circular: detectado.circular, pronto: true }
  }
  return { circular: false, pronto: false }
}
