'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Modal «Atualizar cadastro` e a rota antiga chegam com `?secao=cadastro`.
 * Rola até a ficha sem depender do hash (redirect do App Router descarta `#`).
 */
export function CarteirinhaCadastroAnchor() {
  const searchParams = useSearchParams()
  const focar = searchParams.get('secao') === 'cadastro'

  useEffect(() => {
    const porHash = typeof window !== 'undefined' && window.location.hash === '#cadastro'
    if (!focar && !porHash) return
    const el = document.getElementById('cadastro')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focar])

  return null
}
