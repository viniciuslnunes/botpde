'use client'

import { useActionState, useTransition } from 'react'
import { criarProduto, editarProduto, alterarStatusProduto, atualizarStatusPedido } from '@/app/admin/loja/actions'
import type { ProdutoState } from '@/app/admin/loja/actions'
import { useState, useCallback } from 'react'

const TAMANHOS_OPCOES = ['PP', 'P', 'M', 'G', 'GG', 'EXG']

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}

type Estoque = Record<string, number>

// ── Componente de estoque dinâmico ────────────────────────────────────────────

function EstoqueEditor({
  tamanhos,
  estoque,
  onChange,
}: {
  tamanhos: string[]
  estoque: Estoque
  onChange: (e: Estoque) => void
}) {
  const keys = tamanhos.length === 0 ? ['UN'] : tamanhos

  return (
    <div className="space-y-2">
      {keys.map((t) => (
        <div key={t} className="flex items-center gap-3">
          <span className="w-10 text-sm font-medium text-[rgb(var(--foreground))]">{t}</span>
          <input
            type="number"
            min="0"
            value={estoque[t] ?? 0}
            onChange={(ev) => onChange({ ...estoque, [t]: Number(ev.target.value) })}
            className="w-24 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-[rgb(var(--foreground-muted))]">un.</span>
        </div>
      ))}
    </div>
  )
}

// ── Formulário base compartilhado ─────────────────────────────────────────────

function ProdutoFormFields({
  state,
  defaults,
}: {
  state: ProdutoState
  defaults?: {
    nome?: string
    descricao?: string
    preco?: number
    imagemUrl?: string
    tamanhos?: string[]
    estoque?: Estoque
  }
}) {
  const [tamanhosSel, setTamanhosSel] = useState<string[]>(defaults?.tamanhos ?? [])
  const [estoque, setEstoque] = useState<Estoque>(defaults?.estoque ?? {})

  const toggleTamanho = useCallback((t: string) => {
    setTamanhosSel((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
      setEstoque((e) => {
        const updated: Estoque = {}
        for (const k of next) updated[k] = e[k] ?? 0
        return updated
      })
      return next
    })
  }, [])

  const semTamanho = tamanhosSel.length === 0

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Nome *</label>
        <input
          name="nome"
          defaultValue={defaults?.nome}
          required
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          placeholder="Camiseta Oficial"
        />
        <FieldError errors={state.fieldErrors?.nome} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Descrição</label>
        <textarea
          name="descricao"
          defaultValue={defaults?.descricao}
          rows={3}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm resize-none"
          placeholder="Descrição do produto..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Preço (R$) *</label>
        <input
          name="preco"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.preco}
          required
          className="mt-1 w-40 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          placeholder="49.90"
        />
        <FieldError errors={state.fieldErrors?.preco} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">URL da imagem</label>
        <input
          name="imagemUrl"
          type="url"
          defaultValue={defaults?.imagemUrl}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          placeholder="https://..."
        />
        <FieldError errors={state.fieldErrors?.imagemUrl} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Tamanhos disponíveis</label>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">Deixe vazio para produto único (sem tamanho)</p>
        <div className="flex flex-wrap gap-2">
          {TAMANHOS_OPCOES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTamanho(t)}
              className={[
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                tamanhosSel.includes(t)
                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
        <input type="hidden" name="tamanhos" value={tamanhosSel.join(',')} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
          Estoque {semTamanho ? '(unidades)' : 'por tamanho'}
        </label>
        <div className="mt-2">
          <EstoqueEditor tamanhos={tamanhosSel} estoque={estoque} onChange={setEstoque} />
        </div>
        <input type="hidden" name="estoqueJson" value={JSON.stringify(semTamanho ? { UN: estoque['UN'] ?? 0 } : estoque)} />
      </div>
    </div>
  )
}

// ── Criar Produto ─────────────────────────────────────────────────────────────

const initialState: ProdutoState = {}

export function CriarProdutoForm() {
  const [state, action, pending] = useActionState(criarProduto, initialState)
  const [open, setOpen] = useState(false)

  if (state.success && open) setOpen(false)

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
            <h3 className="font-semibold text-[rgb(var(--foreground))]">Novo produto</h3>
            <button onClick={() => setOpen(false)} className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]">✕</button>
          </div>
          <form action={action} className="space-y-4">
            <ProdutoFormFields state={state} />
            {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{state.error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? 'Salvando...' : 'Criar produto'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Editar Produto ────────────────────────────────────────────────────────────

export function EditarProdutoForm({
  id,
  defaults,
}: {
  id: string
  defaults: {
    nome: string
    descricao?: string | null
    preco: number
    imagemUrl?: string
    tamanhos: string[]
    estoque: Estoque
  }
}) {
  const boundAction = editarProduto.bind(null, id)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <form action={action} className="space-y-4">
      <ProdutoFormFields
        state={state}
        defaults={{
          nome: defaults.nome,
          descricao: defaults.descricao ?? '',
          preco: defaults.preco,
          imagemUrl: defaults.imagemUrl ?? '',
          tamanhos: defaults.tamanhos,
          estoque: defaults.estoque,
        }}
      />
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950">Produto atualizado!</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </form>
  )
}

// ── Toggle Produto ────────────────────────────────────────────────────────────

export function ToggleProdutoButton({ id, ativo }: { id: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => { await alterarStatusProduto(id, !ativo) })}
      className={[
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        ativo
          ? 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
          : 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950',
      ].join(' ')}
    >
      {pending ? '...' : ativo ? 'Desativar' : 'Ativar'}
    </button>
  )
}

// ── Status Pedido ─────────────────────────────────────────────────────────────

const STATUS_PEDIDO_COR: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  CONFIRMADO: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ENTREGUE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export function StatusPedidoBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PEDIDO_COR[status] ?? ''}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function StatusPedidoSelect({ id, statusAtual }: { id: string; statusAtual: string }) {
  const boundAction = atualizarStatusPedido.bind(null, id)
  const [, action, pending] = useActionState(boundAction, {})

  return (
    <form action={action} className="flex items-center gap-2">
      <select
        name="status"
        defaultValue={statusAtual}
        className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xs"
      >
        <option value="PENDENTE">Pendente</option>
        <option value="CONFIRMADO">Confirmado</option>
        <option value="ENTREGUE">Entregue</option>
        <option value="CANCELADO">Cancelado</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? '...' : 'OK'}
      </button>
    </form>
  )
}
