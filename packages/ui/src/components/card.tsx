import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
}

/** Container padrão: cantos arredondados, borda e superfície do tema. */
export function Card({ children, className }: CardProps) {
  return (
    <div
      className={[
        'overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  )
}
