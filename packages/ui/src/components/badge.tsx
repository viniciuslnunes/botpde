import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  primary: 'bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary))]',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  /** Conteúdo à esquerda do texto — normalmente um ícone pequeno (h-3 w-3) */
  icon?: ReactNode
  className?: string
}

/** Chip/etiqueta arredondada — status, contagens, tags. */
export function Badge({ children, variant = 'neutral', icon, className }: BadgeProps) {
  return (
    <span
      className={[
        'flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASS[variant],
        className ?? '',
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  )
}
