'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { ArrowLeft, Calendar } from 'lucide-react'

export function SedeDetailReveal({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return <MotionReveal index={index}>{children}</MotionReveal>
}

export interface SedeLinkItem {
  id: string
  href: string
  tipoLabel: string
  tipoClass: string
  titulo: string
  subtitulo?: string | null
}

export function SedeLinksAnimated({ items, variant }: { items: SedeLinkItem[]; variant: 'filho' | 'evento' }) {
  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
      {items.map((item) => (
        <m.div key={item.id} variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm hover:shadow-sm"
          >
            {variant === 'evento' ? (
              <Calendar className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            ) : null}
            <div className="min-w-0 flex-1">
              {variant === 'filho' ? (
                <>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${item.tipoClass}`}>
                    {item.tipoLabel}
                  </span>
                  <span className="font-medium text-[rgb(var(--foreground))]">{item.titulo}</span>
                  {item.subtitulo && (
                    <span className="ml-2 text-xs text-[rgb(var(--foreground-muted))]">{item.subtitulo}</span>
                  )}
                </>
              ) : (
                <>
                  <p className="truncate font-medium text-[rgb(var(--foreground))]">{item.titulo}</p>
                  {item.subtitulo && (
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">{item.subtitulo}</p>
                  )}
                </>
              )}
            </div>
            <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-[rgb(var(--foreground-muted))]" />
          </Link>
        </m.div>
      ))}
    </m.div>
  )
}
