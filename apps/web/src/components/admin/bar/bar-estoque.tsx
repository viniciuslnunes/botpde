'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import { m } from 'motion/react'
import { Boxes } from 'lucide-react'
import { FieldError } from '@torcida/ui'
import { registrarAjusteEstoqueBar, registrarCompraBar } from '@/app/admin/bar/actions'
import type { BarActionState } from '@/app/admin/bar/actions'
import type { BarProdutoSerializado } from '@/lib/bar-serialize'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'
import { runPersistAction, useActionStateToast } from '@/lib/toast-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { StickyPersistBar } from '@/components/sticky-persist-bar'

const initialState: BarActionState = {}

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function estoqueBaixo(p: BarProdutoSerializado): boolean {
  return p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo
}

// ── Registrar compra (entrada de estoque + DESPESA no livro-caixa) ───────────

export function RegistrarCompraBarForm({ produtos }: { produtos: BarProdutoSerializado[] }) {
  const [state, action, pending] = useActionState(registrarCompraBar, initialState)
  const [open, setOpen] = useState(false)
  const formId = useId()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    id: 'bar-registrar-compra',
    title: 'Registrar compra',
    enabled: open,
    labels: {
      produtoId: 'Produto',
      quantidade: 'Quantidade',
      custoTotal: 'Custo total',
      motivo: 'Motivo',
    },
  })
  const { confirmDiscard } = useUnsavedChangesContext()
  useActionStateToast(state, pending, 'Compra registrada.', {
    successDescription: 'Estoque e custo médio atualizados; despesa lançada no livro-caixa.',
    onSuccess: () => {
      markPristine()
      setOpen(false)
    },
  })

  async function closeForm() {
    const ok = await confirmDiscard()
    if (ok) setOpen(false)
  }

  if (produtos.length === 0) return null

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Registrar compra
        </button>
      ) : (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[rgb(var(--foreground))]">Registrar compra de insumo</h3>
            <button
              type="button"
              onClick={() => void closeForm()}
              className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              ✕
            </button>
          </div>
          <form id={formId} ref={formRef} action={action} data-persist-bar-root="" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Produto *</label>
              <select
                name="produtoId"
                required
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Selecione o produto
                </option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.estoque} un. em estoque
                  </option>
                ))}
              </select>
              <FieldError errors={state.fieldErrors?.produtoId} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  Quantidade *
                </label>
                <input
                  name="quantidade"
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
                />
                <FieldError errors={state.fieldErrors?.quantidade} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  Custo total (R$) *
                </label>
                <input
                  name="custoTotal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
                />
                <FieldError errors={state.fieldErrors?.custoTotal} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Motivo</label>
              <input
                name="motivo"
                placeholder="Ex.: reposição para o jogo de domingo"
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
              />
              <FieldError errors={state.fieldErrors?.motivo} />
            </div>

            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              A compra aumenta o estoque, recalcula o custo médio e lança uma DESPESA na categoria
              BAR do Financeiro.
            </p>

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
              hint="Informe produto, quantidade e custo da compra."
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
                {pending ? 'Registrando...' : 'Registrar compra'}
              </button>
            </StickyPersistBar>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Ajuste manual por linha ──────────────────────────────────────────────────

function AjusteEstoqueRow({ produto, onClose }: { produto: BarProdutoSerializado; onClose: () => void }) {
  const [novaQtd, setNovaQtd] = useState(produto.estoque)
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-[rgb(var(--background-subtle))] px-4 py-3">
      <div>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Nova quantidade
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={novaQtd}
          onChange={(e) => setNovaQtd(Number(e.target.value))}
          className="mt-1 w-28 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-w-48 flex-1">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Motivo (obrigatório)
        </label>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: perda, contagem de inventário"
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))]"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || motivo.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const ok = await runPersistAction(
                () => registrarAjusteEstoqueBar(produto.id, novaQtd, motivo.trim()),
                { success: `Estoque de ${produto.nome} ajustado para ${novaQtd} un.` },
              )
              if (ok) onClose()
            })
          }
          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Ajustando...' : 'Ajustar'}
        </button>
      </div>
    </div>
  )
}

// ── Tabela de estoque ────────────────────────────────────────────────────────

export function BarEstoqueTabela({ produtos }: { produtos: BarProdutoSerializado[] }) {
  const [ajustandoId, setAjustandoId] = useState<string | null>(null)

  if (produtos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Boxes className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum produto para controlar"
        description="Cadastre produtos do bar para acompanhar estoque e custo médio."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <m.ul
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
    >
      {produtos.map((p) => {
        const baixo = estoqueBaixo(p)
        return (
          <m.li key={p.id} variants={staggerItem} className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {p.nome}
                  {!p.ativo && (
                    <span className="ml-2 text-xs font-normal text-[rgb(var(--foreground-muted))]">
                      inativo
                    </span>
                  )}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {p.categoria?.nome ?? 'Sem categoria'} · custo médio {formatarPreco(p.custoMedio)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p
                    className={
                      baixo
                        ? 'text-sm font-semibold text-[rgb(var(--color-warning-fg))]'
                        : 'text-sm font-semibold text-[rgb(var(--foreground))]'
                    }
                  >
                    {p.estoque} un.
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {p.estoqueMinimo != null ? `mínimo ${p.estoqueMinimo}` : 'sem mínimo'}
                  </p>
                </div>
                {baixo && (
                  <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.14)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-warning-fg))]">
                    Repor
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAjustandoId((atual) => (atual === p.id ? null : p.id))}
                  className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
                >
                  Ajuste manual
                </button>
              </div>
            </div>
            {ajustandoId === p.id && (
              <AjusteEstoqueRow produto={p} onClose={() => setAjustandoId(null)} />
            )}
          </m.li>
        )
      })}
    </m.ul>
  )
}
