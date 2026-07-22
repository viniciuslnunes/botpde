import Link from 'next/link'

export interface TablePaginationProps {
  page: number
  totalPages: number
  /** Ver `buildAdminHref` em `@/lib/admin-href`. */
  buildHref: (page: number) => string
}

const BTN_CLASS =
  'rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'

/** Paginação padrão das tabelas admin — server-safe. Não renderiza com 1 página só. */
export function TablePagination({ page, totalPages, buildHref }: TablePaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <p className="text-[rgb(var(--foreground-muted))]">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={buildHref(page - 1)} className={BTN_CLASS}>
            ← Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link href={buildHref(page + 1)} className={BTN_CLASS}>
            Próxima →
          </Link>
        )}
      </div>
    </div>
  )
}
