'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FieldError } from '@torcida/ui'
import {
  alterarStatusProdutoBar,
  criarProdutoBar,
  editarProdutoBar,
  excluirProdutoBar,
} from '@/app/admin/bar/actions'
import type { BarActionState } from '@/app/admin/bar/actions'
import type { BarProdutoSerializado } from '@/lib/bar-serialize'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { runPersistAction, useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { StickyPersistBar } from '@/components/sticky-persist-bar'

const initialState: BarActionState = {}

export type BarCategoriaOption = { id: string; nome: string }

// ── Campos compartilhados (criar / editar) ───────────────────────────────────

function ProdutoBarFormFields({
  state,
  categorias,
  defaults,
  modoEdicao = false,
}: {
  state: BarActionState
  categorias: BarCategoriaOption[]
  defaults?: BarProdutoSerializado
  modoEdicao?: boolean
}) {
  const [ativo, setAtivo] = useState(defaults?.ativo ?? true)
  const [destaque, setDestaque] = useState(defaults?.destaque ?? false)
  const [imagemUrl, setImagemUrl] = useState(defaults?.imagemUrl ?? '')

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Nome *</label>
        <input
          name="nome"
          data-unsaved-label="Nome"
          defaultValue={defaults?.nome}
          required
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          placeholder="Cerveja lata 350ml"
        />
        <FieldError errors={state.fieldErrors?.nome} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Descrição</label>
        <textarea
          name="descricao"
          data-unsaved-label="Descrição"
          defaultValue={defaults?.descricao ?? ''}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          placeholder="Descrição do item do bar…"
        />
        <FieldError errors={state.fieldErrors?.descricao} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Preço (R$) *</label>
          <input
            name="preco"
            data-unsaved-label="Preço"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults?.preco}
            required
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.preco} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Categoria</label>
          <select
            name="categoriaId"
            data-unsaved-label="Categoria"
            defaultValue={defaults?.categoria?.id ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.categoriaId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {modoEdicao ? (
          // Estoque não é editável aqui — movimentado por compra/venda/ajuste.
          // O valor atual segue no form apenas para satisfazer a validação.
          <input type="hidden" name="estoque" value={defaults?.estoque ?? 0} />
        ) : (
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
              Estoque inicial *
            </label>
            <input
              name="estoque"
              data-unsaved-label="Estoque inicial"
              type="number"
              min="0"
              step="1"
              defaultValue={0}
              required
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Abertura de estoque, sem gerar despesa. Reposições entram via compra.
            </p>
            <FieldError errors={state.fieldErrors?.estoque} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Estoque mínimo (alerta)
          </label>
          <input
            name="estoqueMinimo"
            data-unsaved-label="Estoque mínimo"
            type="number"
            min="0"
            step="1"
            defaultValue={defaults?.estoqueMinimo ?? undefined}
            placeholder="0 = alerta ao zerar"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError errors={state.fieldErrors?.estoqueMinimo} />
        </div>
      </div>

      <div>
        <ImageUploadField
          name="imagemUrl"
          label="Imagem"
          value={imagemUrl}
          onChange={setImagemUrl}
          aspect={1}
          purpose="comunidade"
          unsavedLabel="Imagem"
          fieldErrors={state.fieldErrors?.imagemUrl}
          buttonLabel="Enviar imagem"
          hint="Opcional — ajuste o enquadramento antes do upload."
          preview={<ProdutoImagem src={imagemUrl || null} alt="Prévia" variant="thumb" />}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          Ativo (disponível no PDV)
        </label>
        <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]">
          <input
            type="checkbox"
            checked={destaque}
            onChange={(e) => setDestaque(e.target.checked)}
          />
          Destaque
        </label>
        <input type="hidden" name="ativo" data-unsaved-label="Ativo" value={ativo ? 'true' : 'false'} />
        <input
          type="hidden"
          name="destaque"
          data-unsaved-label="Destaque"
          value={destaque ? 'true' : 'false'}
        />
      </div>
    </div>
  )
}

// ── Criar produto ────────────────────────────────────────────────────────────

export function CriarProdutoBarForm({ categorias }: { categorias: BarCategoriaOption[] }) {
  const [state, action, pending] = useActionState(criarProdutoBar, initialState)
  const [open, setOpen] = useState(false)
  const formId = useId()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    title: 'Novo produto do bar',
    enabled: open,
  })
  const { confirmDiscard } = useUnsavedChangesContext()
  useActionStateToast(state, pending, 'Produto criado.', {
    onSuccess: () => {
      markPristine()
      setOpen(false)
    },
  })

  async function closeForm() {
    const ok = await confirmDiscard()
    if (ok) setOpen(false)
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Novo produto
        </button>
      ) : (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[rgb(var(--foreground))]">Novo produto do bar</h3>
            <button
              type="button"
              onClick={() => void closeForm()}
              className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              ✕
            </button>
          </div>
          <form id={formId} ref={formRef} action={action} data-persist-bar-root="" className="space-y-4">
            <ProdutoBarFormFields state={state} categorias={categorias} />
            {state.error && (
              <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
                {state.error}
              </p>
            )}
            <StickyPersistBar
              locked={pending || isDirty}
              dirtyLabel={
                isDirty ? (changes.length === 1 ? changes[0] : `${changes.length} campos alterados`) : undefined
              }
              hint="Preencha os dados do produto e confirme a criação."
            >
              <button
                type="button"
                onClick={() => void closeForm()}
                className="rounded-xl border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={formId}
                disabled={pending}
                className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? 'Salvando...' : 'Criar produto'}
              </button>
            </StickyPersistBar>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Editar produto ───────────────────────────────────────────────────────────

export function EditarProdutoBarForm({
  produto,
  categorias,
}: {
  produto: BarProdutoSerializado
  categorias: BarCategoriaOption[]
}) {
  const boundAction = editarProdutoBar.bind(null, produto.id)
  const [state, action, pending] = useActionState(boundAction, initialState)
  const formId = useId()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    id: `editar-produto-bar-${produto.id}`,
    title: 'Editar produto do bar',
  })
  useActionStateToast(state, pending, 'Produto atualizado.', { onSuccess: markPristine })

  return (
    <form id={formId} ref={formRef} action={action} data-persist-bar-root="" className="space-y-4">
      <ProdutoBarFormFields state={state} categorias={categorias} defaults={produto} modoEdicao />
      {state.error && (
        <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
          {state.error}
        </p>
      )}
      <StickyPersistBar
        locked={pending || isDirty}
        dirtyLabel={
          isDirty ? (changes.length === 1 ? changes[0] : `${changes.length} campos alterados`) : undefined
        }
        hint="Altere os campos e salve. Estoque e custo médio são movimentados pelo Estoque."
      >
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </StickyPersistBar>
    </form>
  )
}

// ── Ativar / desativar ───────────────────────────────────────────────────────

export function ToggleProdutoBarButton({ id, ativo }: { id: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await runPersistAction(() => alterarStatusProdutoBar(id, !ativo), {
            success: ativo ? 'Produto desativado.' : 'Produto ativado.',
          })
        })
      }
      className={[
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        ativo
          ? 'border-[rgb(var(--color-danger)_/_0.35)] text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]'
          : 'border-[rgb(var(--color-success)_/_0.35)] text-[rgb(var(--color-success-fg))] hover:bg-[rgb(var(--color-success)_/_0.08)]',
      ].join(' ')}
    >
      {pending ? '...' : ativo ? 'Desativar' : 'Ativar'}
    </button>
  )
}

// ── Excluir ──────────────────────────────────────────────────────────────────

export function ExcluirProdutoBarButton({
  id,
  nome,
  redirectAfter,
}: {
  id: string
  nome: string
  redirectAfter?: string
}) {
  const confirmAction = useConfirmAction()
  const router = useRouter()

  return (
    <button
      onClick={() =>
        void confirmAction({
          titulo: `Excluir “${nome}”?`,
          descricao:
            'O produto sai do catálogo do bar. Vendas já registradas mantêm o histórico.',
          labelConfirmar: 'Excluir',
          variante: 'destructive',
          cancelled: 'Exclusão cancelada.',
          run: () => excluirProdutoBar(id),
          success: 'Produto excluído.',
        }).then((ok) => {
          if (ok && redirectAfter) router.push(redirectAfter)
        })
      }
      className="rounded-lg border border-[rgb(var(--color-danger)_/_0.35)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
    >
      Excluir
    </button>
  )
}
