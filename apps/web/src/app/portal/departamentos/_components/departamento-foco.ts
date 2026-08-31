'use client'

import { useEffect, useRef } from 'react'

/** Scrolla o card até o centro quando o deep-link aponta para ele. */
export function useFocoCard(ativo: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ativo) return
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  }, [ativo])
  return ref
}

export function classeFocoCard(ativo: boolean): string {
  return ativo
    ? 'scroll-mt-28 ring-2 ring-[rgb(var(--primary)_/_0.5)] ring-offset-2 ring-offset-[rgb(var(--background))]'
    : 'scroll-mt-28'
}
