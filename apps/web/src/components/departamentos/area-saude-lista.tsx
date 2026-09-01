import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { BarraSaude } from './barra-saude'

export type AreaSaudeItem = {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  sazonal: boolean
  href: string
  pessoas: number
  responsaveis: string[]
  checklistDone: number
  checklistTotal: number
  projetosAbertos: number
}

export function AreaSaudeGrupo({
  nome,
  cor,
  children,
}: {
  nome: string
  cor: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <h2 className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
          aria-hidden
        />
        <span className="truncate">{nome}</span>
      </h2>
      <ul className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {children}
      </ul>
    </section>
  )
}

export function AreaSaudeRow({
  item,
  acoes,
  extra,
}: {
  item: AreaSaudeItem
  acoes?: ReactNode
  extra?: ReactNode
}) {
  const semResponsavel = item.ativa && item.responsaveis.length === 0
  const temChecklist = item.checklistTotal > 0
  const pctChecklist = temChecklist
    ? Math.round((item.checklistDone / item.checklistTotal) * 100)
    : null

  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-stretch gap-2 px-3 py-3 sm:px-4">
        <Link
          href={item.href}
          className={[
            'group flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none',
            'focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]',
            item.ativa ? '' : 'opacity-60',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-[rgb(var(--foreground))] group-hover:underline">
                {item.nome}
              </span>
              {item.sazonal ? (
                <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-warning-fg))]">
                  Sazonal
                </span>
              ) : null}
              {!item.ativa ? (
                <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  Inativa
                </span>
              ) : null}
              {semResponsavel ? (
                <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-warning-fg))]">
                  Sem responsável
                </span>
              ) : null}
            </p>
            {item.descricao ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--foreground-muted))]">
                {item.descricao}
              </p>
            ) : null}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--foreground-muted))]">
              {item.responsaveis.length > 0 ? (
                <span className="truncate">{item.responsaveis.join(', ')}</span>
              ) : (
                <span>Ninguém nomeado</span>
              )}
              <span>
                {item.pessoas} {item.pessoas === 1 ? 'pessoa' : 'pessoas'}
              </span>
              <span>
                {item.projetosAbertos}{' '}
                {item.projetosAbertos === 1 ? 'projeto aberto' : 'projetos abertos'}
              </span>
            </p>
            {pctChecklist != null ? (
              <div className="mt-2 max-w-xs">
                <BarraSaude
                  percentual={pctChecklist}
                  label={`Checklist ${item.checklistDone}/${item.checklistTotal}`}
                />
              </div>
            ) : null}
          </div>
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
        {acoes ? <div className="flex shrink-0 items-start gap-1 pt-0.5">{acoes}</div> : null}
      </div>
      {extra ? <div className="border-t border-[rgb(var(--border))] px-3 py-2 sm:px-4">{extra}</div> : null}
    </li>
  )
}
