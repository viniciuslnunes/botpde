import type { ReactNode } from 'react'
import { Card } from '@torcida/ui'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export interface TableShellProps {
  title?: ReactNode
  /** Slot de filtros/busca acima da tabela. */
  filters?: ReactNode
  empty: { icon?: ReactNode; title: string; description?: ReactNode }
  isEmpty: boolean
  /** Slot abaixo da tabela — tipicamente `TablePagination`. */
  footer?: ReactNode
  /** `<thead>` + `<tbody>` do módulo — o shell não é uma DataTable declarativa. */
  children: ReactNode
}

/** Card + `<table>` padrão do admin, com empty state animado e slots de filtros/rodapé. */
export function TableShell({ title, filters, empty, isEmpty, footer, children }: TableShellProps) {
  return (
    <section className="space-y-3">
      {title || filters ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? (
            <h2 className="font-semibold text-[rgb(var(--foreground))]">{title}</h2>
          ) : null}
          {filters}
        </div>
      ) : null}

      {isEmpty ? (
        <MotionEmptyState icon={empty.icon} title={empty.title} description={empty.description} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">{children}</table>
        </Card>
      )}

      {footer}
    </section>
  )
}
