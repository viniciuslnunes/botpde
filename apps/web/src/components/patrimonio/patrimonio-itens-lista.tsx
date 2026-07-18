'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CATEGORIA_PATRIMONIO_LABEL,
  formatarMoedaBRL,
  STATUS_PATRIMONIO_LABEL,
} from '@torcida/types'
import {
  baixarPatrimonioItem,
  excluirPatrimonioItem,
} from '@/app/admin/patrimonio/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import {
  PatrimonioItemForm,
  type PatrimonioFormInitial,
  type ResponsavelOption,
} from '@/components/patrimonio/patrimonio-item-form'
import { Archive, Landmark, Pencil, Trash2 } from 'lucide-react'

export type PatrimonioRow = {
  id: string
  nome: string
  categoria: string
  status: string
  quantidade: number
  localizacao: string | null
  valorEstimado: number | null
  observacao: string | null
  responsavelId: string | null
  responsavelNome: string | null
}

export function PatrimonioItensLista({
  itens,
  podeGerir,
  candidatos,
  total,
  page,
  pageSize,
  basePath,
  query,
}: {
  itens: PatrimonioRow[]
  podeGerir: boolean
  candidatos: ResponsavelOption[]
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
        icon={<Landmark className="mb-3 h-8 w-8 text-stone-600 dark:text-stone-300" />}
        title={total === 0 ? 'Inventário vazio' : 'Nenhum resultado'}
        description={
          total === 0
            ? 'Gestores cadastram instrumentos, bandeirões e outros bens aqui.'
            : 'Ajuste os filtros ou limpe a busca.'
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
        Mostrando {from}–{to} de {total} item{total === 1 ? '' : 's'}
      </p>
      <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {itens.map((item) => {
          const initial: PatrimonioFormInitial = {
            id: item.id,
            nome: item.nome,
            categoria: item.categoria,
            status: item.status,
            quantidade: item.quantidade,
            localizacao: item.localizacao,
            valorEstimado: item.valorEstimado,
            observacao: item.observacao,
            responsavelId: item.responsavelId,
          }
          return (
            <li key={item.id} className="px-4 py-3">
              {editingId === item.id ? (
                <PatrimonioItemForm
                  compact
                  initial={initial}
                  candidatos={candidatos}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                      {item.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                      {CATEGORIA_PATRIMONIO_LABEL[item.categoria] ?? item.categoria}
                      {' · '}
                      {STATUS_PATRIMONIO_LABEL[item.status] ?? item.status}
                      {' · '}
                      qtd {item.quantidade}
                      {item.localizacao ? ` · ${item.localizacao}` : ''}
                      {item.responsavelNome ? ` · ${item.responsavelNome}` : ''}
                      {item.valorEstimado != null
                        ? ` · ${formatarMoedaBRL(item.valorEstimado)}`
                        : ''}
                    </p>
                    {item.observacao && (
                      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                        {item.observacao}
                      </p>
                    )}
                  </div>
                  {podeGerir && (
                    <div className="flex items-center gap-1 self-end sm:self-start">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => setEditingId(item.id)}
                        className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {item.status !== 'BAIXADO' && (
                        <BaixarButton id={item.id} nome={item.nome} />
                      )}
                      <ExcluirButton id={item.id} nome={item.nome} />
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={hrefForPage(page - 1)} className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[rgb(var(--foreground-muted))]">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={hrefForPage(page + 1)} className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline">
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

function BaixarButton({ id, nome }: { id: string; nome: string }) {
  const confirmAction = useConfirmAction()
  return (
    <button
      type="button"
      title="Baixar do inventário"
      onClick={() => {
        void confirmAction({
          titulo: `Baixar “${nome}” do inventário?`,
          descricao: 'O item fica como Baixado e sai do inventário ativo.',
          labelConfirmar: 'Baixar',
          cancelled: 'Baixa cancelada.',
          run: () => baixarPatrimonioItem(id),
          success: 'Item baixado.',
        })
      }}
      className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 dark:hover:bg-amber-950"
    >
      <Archive className="h-4 w-4" />
    </button>
  )
}

function ExcluirButton({ id, nome }: { id: string; nome: string }) {
  const confirmAction = useConfirmAction()
  return (
    <button
      type="button"
      title="Excluir permanentemente"
      onClick={() => {
        void confirmAction({
          titulo: `Excluir permanentemente “${nome}”?`,
          descricao: 'Prefira Baixar se só quiser tirar do inventário ativo.',
          labelConfirmar: 'Excluir',
          variante: 'destructive',
          cancelled: 'Exclusão cancelada.',
          run: () => excluirPatrimonioItem(id),
          success: 'Item excluído.',
        })
      }}
      className="app-action rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
