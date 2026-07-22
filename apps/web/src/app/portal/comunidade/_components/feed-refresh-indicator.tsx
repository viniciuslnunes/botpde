'use client'

import { Loader2 } from 'lucide-react'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'

interface FeedRefreshIndicatorProps {
  visible: boolean
  refreshing: boolean
  pullProgress: number
}

/** Indicador no topo do feed — pull-to-refresh (mobile) e overscroll no desktop. */
export function FeedRefreshIndicator({
  visible,
  refreshing,
  pullProgress,
}: FeedRefreshIndicatorProps) {
  if (!visible && !refreshing) return null

  const label = refreshing
    ? 'Atualizando publicações…'
    : pullProgress >= 1
      ? 'Solte para atualizar'
      : 'Puxe para atualizar'

  return (
    <m.div
      initial={false}
      animate={{
        height: refreshing ? 44 : Math.max(0, pullProgress * 44),
        opacity: refreshing || pullProgress > 0.08 ? 1 : 0,
      }}
      transition={springSnappy}
      className="flex items-center justify-center overflow-hidden"
      aria-live="polite"
      aria-busy={refreshing}
    >
      <div className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
        <Loader2
          className={[
            'h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]',
            refreshing ? 'animate-spin' : '',
          ].join(' ')}
          style={
            !refreshing
              ? { transform: `rotate(${pullProgress * 360}deg)` }
              : undefined
          }
        />
        <span>{label}</span>
      </div>
    </m.div>
  )
}
