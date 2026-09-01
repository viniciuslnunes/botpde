import Link from 'next/link'
import { DatePicker } from '@/components/ui/date-picker'
import {
  detectarPeriodoChip,
  hrefBalanco,
  resolverPeriodoChip,
  type BalancoPeriodoChipId,
} from '@/lib/financeiro-filtros'

const CHIPS: { id: BalancoPeriodoChipId; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'tudo', label: 'Tudo' },
]

export type BalancoUnidadeOption = {
  id: string
  nome: string
  tipoLabel: string
}

export function BalancoPeriodoFiltros({
  values,
  unidades,
}: {
  values: { dataDe?: string; dataAte?: string; sedeId?: string }
  unidades?: BalancoUnidadeOption[]
}) {
  const ativo = detectarPeriodoChip(values.dataDe, values.dataAte)
  const hasCustom = Boolean(values.dataDe || values.dataAte || values.sedeId)
  const sedeId = values.sedeId

  return (
    <div className="no-print space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const periodo = resolverPeriodoChip(chip.id)
          const href = hrefBalanco({ ...periodo, sedeId })
          const selected = ativo === chip.id
          return (
            <Link
              key={chip.id}
              href={href}
              className={[
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {chip.label}
            </Link>
          )
        })}
      </div>

      <form method="get" action="/portal/balanco" className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          De
          <div className="mt-1 block w-full min-w-[9.5rem]">
            <DatePicker
              name="dataDe"
              defaultValue={values.dataDe ?? ''}
              aria-label="Data inicial"
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Até
          <div className="mt-1 block w-full min-w-[9.5rem]">
            <DatePicker
              name="dataAte"
              defaultValue={values.dataAte ?? ''}
              aria-label="Data final"
            />
          </div>
        </label>
        {unidades && unidades.length > 0 && (
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Unidade (bar)
            <select
              name="sedeId"
              defaultValue={values.sedeId ?? ''}
              className="mt-1 block w-full min-w-[12rem] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            >
              <option value="">Todas</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.tipoLabel})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-primary-on"
        >
          Filtrar
        </button>
        {hasCustom && (
          <Link
            href="/portal/balanco"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Limpar
          </Link>
        )}
      </form>
      {values.sedeId && (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Filtro por unidade mostra só movimentos do bar dessa sede/subsede/PDE.
        </p>
      )}
    </div>
  )
}
