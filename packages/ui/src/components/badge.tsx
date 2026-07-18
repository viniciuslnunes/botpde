import type { ReactNode } from 'react'

export type BadgeVariant =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  primary: 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  secondary: 'bg-[rgb(var(--color-secondary)_/_0.14)] text-[rgb(var(--color-secondary-fg))]',
  success: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  warning: 'bg-[rgb(var(--color-warning)_/_0.14)] text-[rgb(var(--color-warning-fg))]',
  danger: 'bg-[rgb(var(--color-danger)_/_0.14)] text-[rgb(var(--color-danger-fg))]',
  info: 'bg-[rgb(var(--color-info)_/_0.14)] text-[rgb(var(--color-info-fg))]',
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
