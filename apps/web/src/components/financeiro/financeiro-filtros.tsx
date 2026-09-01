import Link from 'next/link'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import { DatePicker } from '@/components/ui/date-picker'

export type FinanceiroFiltroValues = {
  tipo?: string
  categoria?: string
  q?: string
  dataDe?: string
  dataAte?: string
}

export function FinanceiroFiltros({
  basePath,
  values,
}: {
  basePath: string
  values: FinanceiroFiltroValues
}) {
  const hasAny = Boolean(
    values.tipo || values.categoria || values.q || values.dataDe || values.dataAte,
  )

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Busca
          <input
            name="q"
            defaultValue={values.q ?? ''}
            placeholder="Descrição ou observação"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
        </label>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Tipo
          <select
            name="tipo"
            defaultValue={values.tipo ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="">Todos</option>
            {Object.entries(TIPO_FINANCEIRO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Categoria
          <select
            name="categoria"
            defaultValue={values.categoria ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="">Todas</option>
            {Object.entries(CATEGORIA_FINANCEIRO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          De
          <div className="mt-1">
            <DatePicker
              name="dataDe"
              defaultValue={values.dataDe ?? ''}
              aria-label="Data inicial"
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Até
          <div className="mt-1">
            <DatePicker
              name="dataAte"
              defaultValue={values.dataAte ?? ''}
              aria-label="Data final"
            />
          </div>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-medium text-primary-on"
        >
          Filtrar
        </button>
        {hasAny && (
          <Link
            href={basePath}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Limpar
          </Link>
        )}
      </div>
    </form>
  )
}
