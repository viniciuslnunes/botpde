'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatarMoedaBRL,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import { excluirLancamentoFinanceiro } from '@/app/admin/financeiro/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { FinanceiroLancamentoForm } from '@/components/financeiro/financeiro-lancamento-form'
import { Pencil, Trash2, Wallet } from 'lucide-react'

export type LancamentoRow = {
  id: string
  tipo: 'RECEITA' | 'DESPESA'
  categoria: string
  valor: number
  descricao: string
  data: string
  observacao: string | null
  criadoPorNome: string | null
}

function formatarData(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (parts) {
    return `${parts[3]}/${parts[2]}/${parts[1]}`
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))
}

export function FinanceiroLancamentosLista({
  itens,
  podeGerir,
  total,
  page,
  pageSize,
  basePath,
  query,
}: {
  itens: LancamentoRow[]
  podeGerir: boolean
  total: number
  page: number
  pageSize: number
  basePath: string
  query?: Record<string, string | undefined>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (itens.length === 0) {
    return (
      <MotionEmptyState
        icon={<Wallet className="mb-3 h-8 w-8 text-emerald-600 dark:text-emerald-400" />}
        title={total === 0 ? 'Caixa vazio' : 'Nenhum resultado'}
        description={
          total === 0
            ? 'Gestores registram receitas e despesas do caixa aqui. O saldo é calculado automaticamente.'
            : 'Ajuste os filtros ou limpe a busca para ver outros lançamentos.'
        }
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-12 text-center"
      />
    )
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function hrefForPage(p: number) {
    const params = new URLSearchParams()
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v) params.set(k, v)
      }
    }
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Mostrando {from}–{to} de {total} lançamento{total === 1 ? '' : 's'}
      </p>
      <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {itens.map((item) => (
          <li key={item.id} className="px-4 py-3">
            {editingId === item.id ? (
              <FinanceiroLancamentoForm
                compact
                initial={{
                  id: item.id,
                  tipo: item.tipo,
                  categoria: item.categoria,
                  valor: item.valor,
                  descricao: item.descricao,
                  data: item.data,
                  observacao: item.observacao,
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {item.descricao}
                  </p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    {TIPO_FINANCEIRO_LABEL[item.tipo] ?? item.tipo}
                    {' · '}
                    {CATEGORIA_FINANCEIRO_LABEL[item.categoria] ?? item.categoria}
                    {' · '}
                    {formatarData(item.data)}
                    {item.criadoPorNome ? ` · ${item.criadoPorNome}` : ''}
                  </p>
                  {item.observacao && (
                    <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                      {item.observacao}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-start">
                  <span
                    className={[
                      'text-sm font-semibold tabular-nums',
                      item.tipo === 'RECEITA'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400',
                    ].join(' ')}
                  >
                    {item.tipo === 'RECEITA' ? '+' : '−'}
                    {formatarMoedaBRL(item.valor)}
                  </span>
                  {podeGerir && (
                    <>
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => setEditingId(item.id)}
                        className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <ExcluirButton id={item.id} descricao={item.descricao} />
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={hrefForPage(page - 1)}
              className="font-medium text-[rgb(var(--primary))] hover:underline"
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
              href={hrefForPage(page + 1)}
              className="font-medium text-[rgb(var(--primary))] hover:underline"
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

function ExcluirButton({ id, descricao }: { id: string; descricao: string }) {
  const confirmAction = useConfirmAction()
  return (
    <button
      type="button"
      title="Excluir lançamento"
      onClick={() => {
        void confirmAction({
          titulo: `Excluir o lançamento “${descricao}”?`,
          descricao: 'Exclusão permanente. Esta ação não pode ser desfeita.',
          labelConfirmar: 'Excluir',
          variante: 'destructive',
          cancelled: 'Exclusão cancelada.',
          run: () => excluirLancamentoFinanceiro(id),
          success: 'Lançamento excluído.',
        })
      }}
      className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
