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
        'alert-success rounded-2xl p-8 text-center'
      }
    >
      {icon}
      <h2 className="text-xl font-bold">{title}</h2>
      {description && (
        <p className="mt-2 text-sm opacity-90">{description}</p>
      )}
      {children}
    </m.div>
  )
}
