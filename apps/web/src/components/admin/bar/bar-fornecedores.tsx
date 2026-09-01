'use client'

import { useActionState, useState, useTransition } from 'react'
import { Truck } from 'lucide-react'
import { FieldError } from '@torcida/ui'
import { alternarAtivoFornecedorBar, criarFornecedorBar, editarFornecedorBar } from '@/app/admin/bar/actions'
import type { BarActionState } from '@/app/admin/bar/actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { runPersistAction, useActionStateToast } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

const initialState: BarActionState = {}

const FORNECEDOR_LABELS = {
  nome: 'Nome',
  contato: 'Contato',
  documento: 'Documento',
  observacao: 'Observação',
} as const

export type BarFornecedorItem = {
  id: string
  nome: string
  contato: string | null
  documento: string | null
  observacao: string | null
  ativo: boolean
}

function AlternarAtivoFornecedorButton({ fornecedor }: { fornecedor: BarFornecedorItem }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await runPersistAction(() => alternarAtivoFornecedorBar(fornecedor.id), {
            success: fornecedor.ativo
              ? `${fornecedor.nome} desativado.`
              : `${fornecedor.nome} ativado.`,
          })
        })
      }
      className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-50"
    >
      {fornecedor.ativo ? 'Desativar' : 'Ativar'}
    </button>
  )
}

function EditarFornecedorForm({
  fornecedor,
  onClose,
}: {
  fornecedor: BarFornecedorItem
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(editarFornecedorBar, initialState)
  useActionStateToast(state, pending, 'Fornecedor atualizado.', { onSuccess: onClose })

  return (
    <form action={action} className="space-y-3 rounded-xl bg-[rgb(var(--background-subtle))] px-4 py-3">
      <input type="hidden" name="id" value={fornecedor.id} />
      {/* `ativo` fica de fora de propósito: `z.coerce.boolean()` trata qualquer string
          não vazia (inclusive "false") como `true`; omitir o campo preserva o status
          atual — a troca de ativo/inativo é feita só pelo botão dedicado. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome *</label>
          <input
            name="nome"
            required
            defaultValue={fornecedor.nome}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
          />
          <FieldError errors={state.fieldErrors?.nome} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Contato</label>
          <input
            name="contato"
            defaultValue={fornecedor.contato ?? ''}
            placeholder="Telefone, e-mail..."
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
          />
          <FieldError errors={state.fieldErrors?.contato} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Documento</label>
          <input
            name="documento"
            defaultValue={fornecedor.documento ?? ''}
            placeholder="CNPJ/CPF"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
          />
          <FieldError errors={state.fieldErrors?.documento} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Observação</label>
          <input
            name="observacao"
            defaultValue={fornecedor.observacao ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
          />
          <FieldError errors={state.fieldErrors?.observacao} />
        </div>
      </div>
      {state.error && (
        <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-primary-on disabled:opacity-50"
        >
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function BarFornecedoresSection({ fornecedores }: { fornecedores: BarFornecedorItem[] }) {
  const [state, action, pending] = useActionState(criarFornecedorBar, initialState)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const { formRef, markPristine } = useTrackedForm({
    id: 'criar-fornecedor-bar',
    title: 'Novo fornecedor do bar',
    labels: FORNECEDOR_LABELS,
  })
  useActionStateToast(state, pending, 'Fornecedor criado.', {
    onSuccess: () => {
      formRef.current?.reset()
      markPristine()
    },
  })

  return (
    <section className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
      <h2 className="font-semibold text-[rgb(var(--foreground))]">Novo fornecedor</h2>

      <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Nome *</label>
          <input
            name="nome"
            required
            placeholder="Ex.: Distribuidora Bebidas SA"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.nome} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Contato</label>
          <input
            name="contato"
            placeholder="Telefone, e-mail..."
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.contato} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Documento</label>
          <input
            name="documento"
            placeholder="CNPJ/CPF"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.documento} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">Observação</label>
          <input
            name="observacao"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.observacao} />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Criando...' : 'Criar fornecedor'}
          </button>
        </div>
      </form>
      {state.error && (
        <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
          {state.error}
        </p>
      )}

      {fornecedores.length === 0 ? (
        <MotionEmptyState
          icon={<Truck className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhum fornecedor cadastrado ainda"
          description="Cadastre fornecedores para vincular às compras de insumo do bar."
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
        />
      ) : (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
          {fornecedores.map((f) => (
            <li key={f.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {f.nome}
                    {!f.ativo && (
                      <span className="ml-2 text-xs font-normal text-[rgb(var(--foreground-muted))]">
                        inativo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {[f.contato, f.documento].filter(Boolean).join(' · ') || 'Sem contato/documento'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditandoId((atual) => (atual === f.id ? null : f.id))}
                    className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
                  >
                    {editandoId === f.id ? 'Fechar' : 'Editar'}
                  </button>
                  <AlternarAtivoFornecedorButton fornecedor={f} />
                </div>
              </div>
              {editandoId === f.id && (
                <EditarFornecedorForm fornecedor={f} onClose={() => setEditandoId(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
