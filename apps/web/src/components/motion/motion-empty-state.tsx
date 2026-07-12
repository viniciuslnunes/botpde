'use client'

import { m } from 'motion/react'
import { fadeUp, springGentle } from '@/lib/motion-presets'

interface MotionEmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: React.ReactNode
  className?: string
}

/** Empty state com entrada suave — feed, listas, galerias. */
export function MotionEmptyState({
  icon,
  title,
  description,
  className,
}: MotionEmptyStateProps) {
  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={fadeUp}
      transition={springGentle}
      className={
        className ??
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center'
      }
    >
      {icon}
      {title && (
        <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{title}</p>
      )}
      {description && (
        <div className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">
          {description}
        </div>
      )}
    </m.div>
  )
}
