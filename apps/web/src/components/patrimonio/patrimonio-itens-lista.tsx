'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { m, useReducedMotion } from 'motion/react'
import { Landmark, Plus } from 'lucide-react'
import { CATEGORIA_BANDEIRA } from '@torcida/types'
import {
  baixarPatrimonioItem,
  excluirPatrimonioItem,
} from '@/app/admin/patrimonio/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'
import {
  PatrimonioItemCard,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-item-card'
import { PatrimonioItemEditorModal } from '@/components/patrimonio/patrimonio-item-editor-modal'
import { PatrimonioVistoriaModal } from '@/components/patrimonio/patrimonio-vistoria-modal'
import type { PatrimonioFormInitial, ResponsavelOption } from '@/components/patrimonio/patrimonio-item-form'

export type { PatrimonioRow }

function toFormInitial(item: PatrimonioRow): PatrimonioFormInitial & {
  vistoria?: PatrimonioRow['vistoria']
} {
  return {
    id: item.id,
    nome: item.nome,
    categoria: item.categoria,
    status: item.status,
    quantidade: item.quantidade,
    localizacao: item.localizacao,
    valorEstimado: item.valorEstimado,
    observacao: item.observacao,
    fotoUrl: item.fotoUrl,
    responsavelId: item.responsavelId,
    vistoria: item.vistoria,
  }
}

export function PatrimonioItensLista({
  itens,
  podeGerir,
  candidatos,
  tenantId,
  total,
  page,
  pageSize,
  basePath,
  query,
  categoriaTravada,
  emptyTitle,
  emptyDescription,
  emptyIcon,
}: {
  itens: PatrimonioRow[]
  podeGerir: boolean
  candidatos: ResponsavelOption[]
  tenantId: string
  total: number
  page: number
  pageSize: number
  basePath: string
  query?: Record<string, string | undefined>
  categoriaTravada?: string | null
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode
}) {
  const [editing, setEditing] = useState<PatrimonioRow | 'novo' | null>(null)
  const [vistoriando, setVistoriando] = useState<PatrimonioRow | null>(null)
  const confirmAction = useConfirmAction()
  const reduceMotion = useReducedMotion()

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
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

  function baixar(item: PatrimonioRow) {
    void confirmAction({
      titulo: `Baixar “${item.nome}” do inventário?`,
      descricao: 'O item fica como Baixado e sai do inventário ativo.',
      labelConfirmar: 'Baixar',
      cancelled: 'Baixa cancelada.',
      run: () => baixarPatrimonioItem(item.id),
      success: 'Item baixado.',
    })
  }

  function excluir(item: PatrimonioRow) {
    void confirmAction({
      titulo: `Excluir permanentemente “${item.nome}”?`,
      descricao: 'Prefira Baixar se só quiser tirar do inventário ativo.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: 'Exclusão cancelada.',
      run: () => excluirPatrimonioItem(item.id),
      success: 'Item excluído.',
    })
  }

  const vazio = itens.length === 0
  const emptyHeadline =
    emptyTitle ?? (total === 0 ? 'Inventário vazio' : 'Nenhum resultado')
  const emptyCopy =
    emptyDescription ??
    (total === 0
      ? 'Gestores cadastram instrumentos, bandeirões e outros bens aqui.'
      : 'Ajuste os filtros ou limpe a busca.')

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Mostrando {from}–{to} de {total} item{total === 1 ? '' : 's'}
        </p>
      ) : null}

      {vazio && !podeGerir ? (
        <MotionEmptyState
          icon={emptyIcon ?? <Landmark className="mb-3 h-8 w-8 text-stone-600 dark:text-stone-300" />}
          title={emptyHeadline}
          description={emptyCopy}
          className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-12 text-center"
        />
      ) : vazio && podeGerir ? (
        <m.button
          type="button"
          initial={reduceMotion ? undefined : 'hidden'}
          animate={reduceMotion ? undefined : 'show'}
          variants={reduceMotion ? undefined : staggerItem}
          onClick={() => setEditing('novo')}
          className="app-action flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-12 text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary)_/_0.45)] hover:bg-[rgb(var(--color-primary)_/_0.06)] hover:text-[rgb(var(--foreground))]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current">
            <Plus className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[rgb(var(--foreground))]">Novo item</span>
          <span className="max-w-xs text-center text-xs">
            {total === 0
              ? (emptyDescription ?? 'Nenhum item ainda — cadastre com foto.')
              : 'Nenhum resultado para estes filtros.'}
          </span>
        </m.button>
      ) : (
        <m.div
          variants={reduceMotion ? undefined : staggerContainer}
          initial={reduceMotion ? undefined : 'hidden'}
          animate={reduceMotion ? undefined : 'show'}
          className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {podeGerir ? (
            <m.button
              type="button"
              variants={reduceMotion ? undefined : staggerItem}
              onClick={() => setEditing('novo')}
              className="app-action flex h-full min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary)_/_0.45)] hover:bg-[rgb(var(--color-primary)_/_0.06)] hover:text-[rgb(var(--foreground))]"
            >
              <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current">
                  <Plus className="h-5 w-5" aria-hidden />
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3">
                <span className="text-sm font-semibold">Novo item</span>
                <span className="text-center text-[11px]">Cadastre com foto</span>
              </span>
            </m.button>
          ) : null}

          {itens.map((item) => (
            <m.div key={item.id} variants={reduceMotion ? undefined : staggerItem} className="h-full min-w-0">
              <PatrimonioItemCard
                item={item}
                podeGerir={podeGerir}
                onEdit={() => setEditing(item)}
                onVistoria={
                  podeGerir && item.categoria === CATEGORIA_BANDEIRA
                    ? () => setVistoriando(item)
                    : undefined
                }
                onBaixar={() => baixar(item)}
                onExcluir={() => excluir(item)}
              />
            </m.div>
          ))}
        </m.div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={hrefForPage(page - 1)}
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
              href={hrefForPage(page + 1)}
              className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <PatrimonioItemEditorModal
        key={editing === 'novo' ? 'novo' : editing?.id ? `edit-${editing.id}` : 'closed'}
        open={editing != null}
        item={editing != null && editing !== 'novo' ? toFormInitial(editing) : null}
        candidatos={candidatos}
        tenantId={tenantId}
        categoriaTravada={categoriaTravada}
        onClose={() => setEditing(null)}
      />

      {vistoriando ? (
        <PatrimonioVistoriaModal
          key={vistoriando.id}
          open
          itemId={vistoriando.id}
          itemNome={vistoriando.nome}
          inicial={vistoriando.vistoria ?? null}
          onClose={() => setVistoriando(null)}
        />
      ) : null}
    </div>
  )
}
