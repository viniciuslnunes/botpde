'use client'

import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { BANDEIRA_UF } from '@/lib/bandeiras-estados'
import { NOME_UF } from '@/lib/regioes-brasil'
import { springSnappy } from '@/lib/motion-presets'

type Props = {
  uf: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZES = {
  sm: 'h-8 w-11',
  md: 'h-10 w-14',
} as const

/** Bandeira do estado com transição ao trocar de UF. */
export function BandeiraEstado({ uf, size = 'md', className = '' }: Props) {
  const reduceMotion = useReducedMotion()
  const src = BANDEIRA_UF[uf]

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm ${SIZES[size]} ${className}`}
      aria-hidden
    >
      <AnimatePresence mode="wait">
        <m.img
          key={uf}
          src={src}
          alt=""
          initial={reduceMotion ? false : { opacity: 0, scale: 0.88, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 1.04, filter: 'blur(2px)' }}
          transition={reduceMotion ? { duration: 0 } : springSnappy}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const el = e.currentTarget
            el.style.display = 'none'
            const fallback = el.parentElement?.querySelector('[data-fallback]')
            if (fallback instanceof HTMLElement) fallback.style.display = 'flex'
          }}
        />
      </AnimatePresence>
      <span
        data-fallback
        className="absolute inset-0 hidden items-center justify-center bg-[rgb(var(--surface-raised))] text-[10px] font-bold text-[rgb(var(--foreground-muted))]"
        style={{ display: 'none' }}
      >
        {uf}
      </span>
      <span className="sr-only">Bandeira de {NOME_UF[uf] ?? uf}</span>
    </div>
  )
}
