'use client'

import { m } from 'motion/react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'

export function EventoDetailReveal({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return <MotionReveal index={index}>{children}</MotionReveal>
}

export interface EventoConfirmadoItem {
  id: string
  nome: string
  avatarUrl: string | null
}

export function EventoConfirmadosGrid({ confirmados }: { confirmados: EventoConfirmadoItem[] }) {
  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-wrap gap-3">
      {confirmados.map((r) => (
        <m.div
          key={r.id}
          variants={staggerItem}
          className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]"
        >
          {r.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.avatarUrl}
              alt={r.nome}
              className="h-7 w-7 rounded-full ring-1 ring-[rgb(var(--border))]"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-[rgb(var(--border))]" />
          )}
          <span className="text-xs">{r.nome}</span>
        </m.div>
      ))}
    </m.div>
  )
}
