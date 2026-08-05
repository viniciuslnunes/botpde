'use client'

import { useLayoutEffect, useState } from 'react'
import {
  detectarEscudoCircular,
  lerCacheEscudoCircular,
  subscribeEscudoCircular,
} from '@/lib/escudo-forma'

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
  const [circular, setCircular] = useState(shape === 'circle')
  const [pronto, setPronto] = useState(shape !== 'auto' || !src)

  useLayoutEffect(() => {
    if (!src) {
      setCircular(false)
      setPronto(true)
      return
    }
    if (shape === 'circle') {
      setCircular(true)
      setPronto(true)
      return
    }
    if (shape === 'rounded') {
      setCircular(false)
      setPronto(true)
      return
    }

    let ativo = true
    const unsub = subscribeEscudoCircular((url, valor) => {
      if (!ativo || url !== src) return
      setCircular(valor)
      setPronto(true)
    })

    const hit = lerCacheEscudoCircular(src)
    if (hit !== null) {
      setCircular(hit)
      setPronto(true)
    } else {
      setCircular(false)
      setPronto(false)
      void detectarEscudoCircular(src).catch(() => {
        if (!ativo) return
        setCircular(false)
        setPronto(true)
      })
    }

    return () => {
      ativo = false
      unsub()
    }
  }, [src, shape])

  return { circular, pronto }
}
