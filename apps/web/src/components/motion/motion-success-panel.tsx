'use client'

import { m } from 'motion/react'
import { fadeScale, springSnappy } from '@/lib/motion-presets'

interface MotionSuccessPanelProps {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/** Painel de sucesso (checkout, sacola, ações concluídas). */
export function MotionSuccessPanel({
  icon,
  title,
  description,
  children,
  className,
}: MotionSuccessPanelProps) {
  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={fadeScale}
      transition={springSnappy}
      className={
        className ??
        'rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950'
      }
    >
      {icon}
      <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{title}</h2>
      {description && (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{description}</p>
      )}
      {children}
    </m.div>
  )
}
