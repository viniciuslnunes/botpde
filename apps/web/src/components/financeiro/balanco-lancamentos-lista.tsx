import Link from 'next/link'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatDataCompetenciaInput,
  formatarMoedaBRL,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Scale } from 'lucide-react'
import type { BalancoLancamentoDetalhe } from '@/lib/financeiro'
import { hrefBalanco } from '@/lib/financeiro-filtros'

function formatarDataHora(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value)
}

function formatarDiaCabecalho(isoDia: string) {
  const [y, m, d] = isoDia.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function metaLinha(item: BalancoLancamentoDetalhe): string {
  const partes: string[] = [
    TIPO_FINANCEIRO_LABEL[item.tipo] ?? item.tipo,
    CATEGORIA_FINANCEIRO_LABEL[item.categoria] ?? item.categoria,
    formatarDataHora(item.data),
  ]
  if (item.unidadeNome) partes.push(item.unidadeNome)
  if (item.departamentoNome) partes.push(item.departamentoNome)
  if (item.pessoaNome) {
    const papel =
      item.origem === 'BAR_VENDA'
        ? 'Vendeu'
        : item.origem === 'BAR_COMPRA'
          ? 'Registrou'
          : item.origem === 'COBRANCA'
            ? 'Pago por'
            : 'Por'
    partes.push(`${papel}: ${item.pessoaNome}`)
  }
  if (item.metodoPagamentoLabel) partes.push(item.metodoPagamentoLabel)
  return partes.join(' · ')
}

function agruparPorDia(
  itens: BalancoLancamentoDetalhe[],
): { dia: string; itens: BalancoLancamentoDetalhe[] }[] {
  const grupos: { dia: string; itens: BalancoLancamentoDetalhe[] }[] = []
  const mapa = new Map<string, BalancoLancamentoDetalhe[]>()

  for (const item of itens) {
    const dia = formatDataCompetenciaInput(item.data)
    const lista = mapa.get(dia)
    if (lista) {
      lista.push(item)
    } else {
      const novo = [item]
      mapa.set(dia, novo)
      grupos.push({ dia, itens: novo })
    }
  }
  return grupos
}

export function BalancoLancamentosLista({
  itens,
  total,
  page,
  pageSize,
  query,
}: {
  itens: BalancoLancamentoDetalhe[]
  total: number
  page: number
  pageSize: number
  query?: { dataDe?: string; dataAte?: string; sedeId?: string }
}) {
  if (itens.length === 0) {
    return (
      <MotionEmptyState
        icon={<Scale className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Ainda sem movimentos"
        description={
          query?.dataDe || query?.dataAte
            ? 'Nenhum lançamento neste período. Ajuste as datas ou limpe o filtro.'
            : 'Quando houver receitas e despesas no livro-caixa, cada entrada e saída aparece detalhada aqui.'
        }
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const porDia = agruparPorDia(itens)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Movimentações
          </h2>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Mostrando {from}–{to} de {total} lançamento{total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {porDia.map((grupo) => (
          <section key={grupo.dia} className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <h3 className="sticky top-0 z-[1] border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-xs font-semibold tracking-wide text-[rgb(var(--foreground-muted))] first-letter:uppercase">
              {formatarDiaCabecalho(grupo.dia)}
            </h3>
            <ul className="divide-y divide-[rgb(var(--border))]">
              {grupo.itens.map((item) => (
                <li key={item.id} className="px-4 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                        {item.descricao}
                      </p>
                      <p className="text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                        {metaLinha(item)}
                      </p>
                      {item.itens && item.itens.length > 0 && (
                        <ul className="mt-1 space-y-1 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs">
                          {item.itens.map((linha, idx) => (
                            <li
                              key={`${item.id}-${idx}-${linha.nome}`}
                              className="flex items-baseline justify-between gap-3"
                            >
                              <span className="min-w-0 text-[rgb(var(--foreground))]">
                                {linha.nome}
                                <span className="text-[rgb(var(--foreground-muted))]">
                                  {' '}
                                  × {linha.quantidade}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-[rgb(var(--foreground-muted))]">
                                {formatarMoedaBRL(linha.total)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.observacao && (
                        <p className="text-xs text-[rgb(var(--foreground-muted))]">
                          {item.observacao}
                        </p>
                      )}
                    </div>
                    <span
                      className={[
                        'shrink-0 self-end text-sm font-semibold tabular-nums sm:self-start',
                        item.tipo === 'RECEITA'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400',
                      ].join(' ')}
                    >
                      {item.tipo === 'RECEITA' ? '+' : '−'}
                      {formatarMoedaBRL(item.valor)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          className="no-print flex items-center justify-between gap-3 text-sm"
          aria-label="Paginação"
        >
          {page > 1 ? (
            <Link
              href={hrefBalanco({ ...query, page: page - 1 })}
              className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[rgb(var(--foreground-muted))]">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={hrefBalanco({ ...query, page: page + 1 })}
              className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
