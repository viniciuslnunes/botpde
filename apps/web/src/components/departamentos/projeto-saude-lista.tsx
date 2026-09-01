import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { labelStatusProjeto, labelTipoProjeto } from '@torcida/types'
import { BarraSaude } from './barra-saude'

const TOM_STATUS: Record<string, string> = {
  neutral: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  primary: 'bg-[rgb(var(--primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  success: 'bg-[rgb(var(--color-success)_/_0.16)] text-[rgb(var(--color-success-fg))]',
  danger: 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]',
  warning: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
}

export type ProjetoSaudeItem = {
  id: string
  titulo: string
  href: string
  tipo: string
  status: string
  areaNome: string | null
  departamentoNome?: string
  departamentoCor?: string
  inicioLabel: string
  fimLabel: string | null
  atrasado: boolean
  naJanela: boolean
  metaPct: number | null
  metaLabel: string | null
  orcamentoPct: number | null
  orcamentoEstourou: boolean
  orcamentoLabel: string | null
  responsavelNome: string | null
}

export function ProjetoSaudeGrupo({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <h2 className="px-1 pb-2 text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
      <ul className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {children}
      </ul>
    </section>
  )
}

export function ProjetoSaudeRow({
  item,
  acoes,
}: {
  item: ProjetoSaudeItem
  acoes?: ReactNode
}) {
  const tomStatus = item.atrasado
    ? 'warning'
    : item.status === 'ATIVO'
      ? 'primary'
      : item.status === 'CONCLUIDO'
        ? 'success'
        : item.status === 'CANCELADO'
          ? 'danger'
          : 'neutral'

  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-stretch gap-2 px-3 py-3 sm:px-4">
        <Link
          href={item.href}
          className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5">
              {item.departamentoCor ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.departamentoCor }}
                  aria-hidden
                />
              ) : null}
              <span className="truncate text-sm font-medium text-[rgb(var(--foreground))] group-hover:underline">
                {item.titulo}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TOM_STATUS[tomStatus] ?? TOM_STATUS.neutral}`}
              >
                {item.atrasado ? 'Atrasado' : labelStatusProjeto(item.status)}
              </span>
              {item.naJanela && !item.atrasado ? (
                <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-warning-fg))]">
                  Na janela
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
              <span>{labelTipoProjeto(item.tipo)}</span>
              {item.departamentoNome ? <span>· {item.departamentoNome}</span> : null}
              {item.areaNome ? <span>· {item.areaNome}</span> : null}
              <span>
                · {item.inicioLabel}
                {item.fimLabel ? ` – ${item.fimLabel}` : ' · contínuo'}
              </span>
              {item.responsavelNome ? <span>· {item.responsavelNome}</span> : null}
            </p>
            <div className="mt-2 grid max-w-lg gap-2 sm:grid-cols-2">
              {item.metaPct != null && item.metaLabel ? (
                <BarraSaude percentual={item.metaPct} label={item.metaLabel} />
              ) : (
                <p className="text-[11px] text-[rgb(var(--foreground-muted))]">Sem meta</p>
              )}
              {item.orcamentoPct != null && item.orcamentoLabel ? (
                <BarraSaude
                  percentual={item.orcamentoPct}
                  alerta={item.orcamentoEstourou}
                  label={item.orcamentoLabel}
                />
              ) : (
                <p className="text-[11px] text-[rgb(var(--foreground-muted))]">Sem orçamento</p>
              )}
            </div>
          </div>
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
        {acoes ? <div className="flex shrink-0 items-start gap-1 pt-0.5">{acoes}</div> : null}
      </div>
    </li>
  )
}
