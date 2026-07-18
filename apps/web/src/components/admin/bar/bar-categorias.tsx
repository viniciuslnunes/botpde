'use client'

import { useActionState } from 'react'
import { criarCategoriaBar, excluirCategoriaBar } from '@/app/admin/bar/actions'
import type { BarActionState } from '@/app/admin/bar/actions'
import { FieldError } from '@torcida/ui'
import { useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

const initialState: BarActionState = {}

export type BarCategoriaItem = {
  id: string
  nome: string
  ordem: number
  ativo: boolean
  totalProdutos: number
}

function ExcluirCategoriaBarButton({ categoria }: { categoria: BarCategoriaItem }) {
  const confirmAction = useConfirmAction()

  return (
    <button
      onClick={() =>
        void confirmAction({
          titulo: `Excluir a categoria “${categoria.nome}”?`,
          descricao:
            categoria.totalProdutos > 0
              ? `Há ${categoria.totalProdutos} produto(s) nesta categoria — eles ficam sem categoria.`
              : 'A categoria será removida do catálogo do bar.',
          labelConfirmar: 'Excluir',
          variante: 'destructive',
          cancelled: 'Exclusão cancelada.',
          run: () => excluirCategoriaBar(categoria.id),
          success: 'Categoria excluída.',
        })
      }
      className="text-xs font-medium text-[rgb(var(--color-danger-fg))] hover:underline"
    >
      Excluir
    </button>
  )
}

export function BarCategoriasSection({ categorias }: { categorias: BarCategoriaItem[] }) {
  const [state, action, pending] = useActionState(criarCategoriaBar, initialState)
  const { formRef, markPristine } = useTrackedForm({
    id: 'criar-categoria-bar',
    title: 'Nova categoria do bar',
    labels: { nome: 'Nome', ordem: 'Ordem' },
  })
  useActionStateToast(state, pending, 'Categoria criada.', {
    onSuccess: () => {
      formRef.current?.reset()
      markPristine()
    },
  })

  return (
    <section className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
      <h2 className="font-semibold text-[rgb(var(--foreground))]">Categorias</h2>

      <form ref={formRef} action={action} className="flex flex-wrap items-start gap-3">
        <div className="min-w-48 flex-1">
          <input
            name="nome"
            required
            placeholder="Nome da categoria (ex.: Bebidas)"
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.nome} />
        </div>
        <div>
          <input
            name="ordem"
            type="number"
            step="1"
            defaultValue={categorias.length + 1}
            aria-label="Ordem"
            className="w-24 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.ordem} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Criando...' : 'Criar'}
        </button>
      </form>
      {state.error && (
        <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
          {state.error}
        </p>
      )}

      {categorias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhuma categoria ainda — os produtos podem existir sem categoria.
        </p>
      ) : (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[rgb(var(--foreground))]">{c.nome}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {c.totalProdutos} produto{c.totalProdutos !== 1 ? 's' : ''} · ordem {c.ordem}
                  {!c.ativo && ' · inativa'}
                </p>
              </div>
              <ExcluirCategoriaBarButton categoria={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
