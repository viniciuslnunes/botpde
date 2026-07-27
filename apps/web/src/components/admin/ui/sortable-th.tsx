import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

export interface SortableThProps {
  label: string
  column: string
  currentSort: string
  currentDir: SortDir
  /** Href ao ativar/alternar esta coluna (já com query completa). */
  href: string
  className?: string
  align?: 'left' | 'right'
}

/**
 * Cabeçalho de coluna ordenável via URL (`sort` + `dir`).
 * Mantém a listagem server-driven e paginável.
 */
export function SortableTh({
  label,
  column,
  currentSort,
  currentDir,
  href,
  className = '',
  align = 'left',
}: SortableThProps) {
  const active = currentSort === column
  const Icon = !active ? ArrowUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      className={[
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      ].join(' ')}
      aria-sort={
        active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <Link
        href={href}
        className={[
          'inline-flex items-center gap-1 transition-colors',
          active
            ? 'text-[rgb(var(--foreground))]'
            : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          align === 'right' ? 'justify-end' : '',
        ].join(' ')}
        title={
          active
            ? `Ordenado ${currentDir === 'asc' ? 'crescente' : 'decrescente'} — clique para inverter`
            : `Ordenar por ${label}`
        }
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </Link>
    </th>
  )
}
