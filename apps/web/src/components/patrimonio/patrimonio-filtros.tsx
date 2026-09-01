import Link from 'next/link'
import {
  CATEGORIA_PATRIMONIO_LABEL,
  STATUS_PATRIMONIO_LABEL,
} from '@torcida/types'

export type PatrimonioFiltroValues = {
  categoria?: string
  status?: string
  q?: string
  incluirBaixados?: boolean
}

export function PatrimonioFiltros({
  basePath,
  values,
  /**
   * Categoria imposta pelo RBAC (`flags:view` = só BANDEIRA). O filtro some em
   * vez de virar select desabilitado: escolher entre uma opção é ruído, e a
   * trava real é da query no servidor.
   */
  categoriaTravada,
  /** Tab da URL a preservar no GET (admin). Ausente no portal. */
  tab,
}: {
  basePath: string
  values: PatrimonioFiltroValues
  categoriaTravada?: string | null
  tab?: string
}) {
  const hasAny = Boolean(
    (!categoriaTravada && values.categoria) ||
      values.status ||
      values.q ||
      values.incluirBaixados,
  )
  const limparHref = tab ? `${basePath}?tab=${encodeURIComponent(tab)}` : basePath

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      {tab ? <input type="hidden" name="tab" value={tab} /> : null}
      <div
        className={
          categoriaTravada
            ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
        }
      >
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Busca
          <input
            name="q"
            defaultValue={values.q ?? ''}
            placeholder="Nome, local ou observação"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
        </label>
        {!categoriaTravada && (
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Categoria
            <select
              name="categoria"
              defaultValue={values.categoria ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            >
              <option value="">Todas</option>
              {Object.entries(CATEGORIA_PATRIMONIO_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Status
          <select
            name="status"
            defaultValue={values.status ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="">Ativos (sem baixados)</option>
            {Object.entries(STATUS_PATRIMONIO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <input
            type="checkbox"
            name="incluirBaixados"
            value="1"
            defaultChecked={values.incluirBaixados}
            className="rounded border-[rgb(var(--border))]"
          />
          Incluir baixados
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-medium text-primary-on"
        >
          Filtrar
        </button>
        {hasAny && (
          <Link
            href={limparHref}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Limpar
          </Link>
        )}
      </div>
    </form>
  )
}
