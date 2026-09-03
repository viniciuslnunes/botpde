import Link from 'next/link'
import {
  CATEGORIA_PATRIMONIO_LABEL,
  STATUS_PATRIMONIO_LABEL,
} from '@torcida/types'
import { AppButton } from '@/components/ui/button'
import { Filter, Search } from 'lucide-react'

export type PatrimonioFiltroValues = {
  categoria?: string
  status?: string
  q?: string
  incluirBaixados?: boolean
}

const INPUT =
  'mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]'

const INPUT_PORTAL =
  'h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 text-sm text-[rgb(var(--foreground))]'

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
  /**
   * `toolbar`: linha do cabeçalho admin (sem card). `portal`: barra compacta
   * no painel sticky do canal (Agenda). `card`: formulário empilhado legado.
   */
  variant = 'card',
}: {
  basePath: string
  values: PatrimonioFiltroValues
  categoriaTravada?: string | null
  tab?: string
  variant?: 'card' | 'toolbar' | 'portal'
}) {
  const hasAny = Boolean(
    (!categoriaTravada && values.categoria) ||
      values.status ||
      values.q ||
      values.incluirBaixados,
  )
  const limparHref = tab ? `${basePath}?tab=${encodeURIComponent(tab)}` : basePath
  const toolbar = variant === 'toolbar'
  const portal = variant === 'portal'

  if (portal) {
    return (
      <form
        method="get"
        action={basePath}
        className="flex flex-col gap-3 border-t border-[rgb(var(--border))] pt-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        {tab ? <input type="hidden" name="tab" value={tab} /> : null}
        <label className="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-md">
          <span className="sr-only">Busca</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={values.q ?? ''}
            placeholder="Buscar nome, local ou observação…"
            className={`${INPUT_PORTAL} ps-9`}
          />
        </label>
        {!categoriaTravada ? (
          <label className="min-w-0 sm:w-40">
            <span className="sr-only">Categoria</span>
            <select
              name="categoria"
              defaultValue={values.categoria ?? ''}
              className={INPUT_PORTAL}
              aria-label="Categoria"
            >
              <option value="">Todas as categorias</option>
              {Object.entries(CATEGORIA_PATRIMONIO_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="min-w-0 sm:w-44">
          <span className="sr-only">Status</span>
          <select
            name="status"
            defaultValue={values.status ?? ''}
            className={INPUT_PORTAL}
            aria-label="Status"
          >
            <option value="">Ativos (sem baixados)</option>
            {Object.entries(STATUS_PATRIMONIO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex shrink-0 items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
          <input
            type="checkbox"
            name="incluirBaixados"
            value="1"
            defaultChecked={values.incluirBaixados}
            className="rounded border-[rgb(var(--border))]"
          />
          Incluir baixados
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
          <AppButton
            variant="outline"
            icon={Filter}
            type="submit"
            className="h-10 rounded-lg px-3 text-sm"
          >
            Filtrar
          </AppButton>
          {hasAny ? (
            <Link
              href={limparHref}
              className="app-touch-line rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>
    )
  }

  return (
    <form
      method="get"
      action={basePath}
      className={
        toolbar
          ? 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end'
          : 'flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4'
      }
    >
      {tab ? <input type="hidden" name="tab" value={tab} /> : null}
      <label
        className={[
          'block text-xs font-medium text-[rgb(var(--foreground-muted))]',
          toolbar ? 'min-w-0 flex-1 sm:max-w-sm' : '',
        ].join(' ')}
      >
        Busca
        <input
          name="q"
          defaultValue={values.q ?? ''}
          placeholder="Nome, local ou observação"
          className={INPUT}
        />
      </label>
      {!categoriaTravada && (
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Categoria
          <select name="categoria" defaultValue={values.categoria ?? ''} className={INPUT}>
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
        <select name="status" defaultValue={values.status ?? ''} className={INPUT}>
          <option value="">Ativos (sem baixados)</option>
          {Object.entries(STATUS_PATRIMONIO_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs font-medium text-[rgb(var(--foreground-muted))] sm:pb-2.5">
        <input
          type="checkbox"
          name="incluirBaixados"
          value="1"
          defaultChecked={values.incluirBaixados}
          className="rounded border-[rgb(var(--border))]"
        />
        Incluir baixados
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
        <AppButton
          variant="primary"
          icon={Filter}
          type="submit"
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          Filtrar
        </AppButton>
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
