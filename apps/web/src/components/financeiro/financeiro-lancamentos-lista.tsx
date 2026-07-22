'use client'

import { useState } from 'react'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatarMoedaBRL,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import { excluirLancamentoFinanceiro } from '@/app/admin/financeiro/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { TablePagination, TableShell } from '@/components/admin/ui'
import { buildAdminHref } from '@/lib/admin-href'
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

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function hrefForPage(p: number) {
    return buildAdminHref(basePath, {
      ...(query ?? {}),
      page: p > 1 ? p : undefined,
    })
  }

  return (
    <TableShell
      title={
        itens.length > 0 ? (
          <span className="text-xs font-normal text-[rgb(var(--foreground-muted))]">
            Mostrando {from}–{to} de {total} lançamento{total === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
      isEmpty={itens.length === 0}
      empty={{
        icon: <Wallet className="mb-3 h-8 w-8 text-[rgb(var(--color-success-fg))]" />,
        title: total === 0 ? 'Caixa vazio' : 'Nenhum resultado',
        description:
          total === 0
            ? 'Gestores registram receitas e despesas do caixa aqui. O saldo é calculado automaticamente.'
            : 'Ajuste os filtros ou limpe a busca para ver outros lançamentos.',
      }}
      footer={<TablePagination page={page} totalPages={totalPages} buildHref={hrefForPage} />}
    >
      <tbody className="divide-y divide-[rgb(var(--border))]">
        {itens.map((item) => (
          <tr key={item.id} className="align-top">
            {editingId === item.id ? (
              <td colSpan={2} className="px-4 py-3">
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
              </td>
            ) : (
              <>
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={[
                        'text-sm font-semibold tabular-nums',
                        item.tipo === 'RECEITA'
                          ? 'text-[rgb(var(--color-success-fg))]'
                          : 'text-[rgb(var(--color-danger-fg))]',
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
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </TableShell>
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
