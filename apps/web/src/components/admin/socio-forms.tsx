'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus, RefreshCw, Trash2, X, Check } from 'lucide-react'
import { emitirCarteirinha, renovarCarteirinha, revogarCarteirinha } from '@/app/admin/socios/actions'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'

interface MembroElegivel {
  userId: string
  nome: string
  discordTag: string | null
}

interface EmitirCarteirinhaFormProps {
  membrosElegiveis: MembroElegivel[]
}

function getValidadePadrao() {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function EmitirCarteirinhaForm({ membrosElegiveis }: EmitirCarteirinhaFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [defaultValidade] = useState(getValidadePadrao)
  const { formRef, markPristine } = useTrackedForm({
    title: 'Nova carteirinha',
    enabled: open,
  })
  const { confirmDiscard } = useUnsavedChangesContext()

  async function closeForm() {
    const ok = await confirmDiscard()
    if (ok) setOpen(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => emitirCarteirinha(fd), {
        success: 'Carteirinha emitida.',
        errorFallback: 'Não foi possível emitir a carteirinha.',
      })
      if (ok) {
        markPristine()
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={membrosElegiveis.length === 0}
        className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Emitir carteirinha
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--surface))] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[rgb(var(--foreground))]">Nova carteirinha</h3>
        <button type="button" onClick={() => void closeForm()} className="text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Membro</label>
          <select
            name="userId"
            required
            className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          >
            <option value="">Selecione um membro...</option>
            {membrosElegiveis.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nome} {m.discordTag ? `(${m.discordTag})` : ''}
              </option>
            ))}
          </select>
          {membrosElegiveis.length === 0 && (
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Nenhum membro do tipo Sócio aprovado sem carteirinha.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Nome na carteirinha
          </label>
          <input
            name="nome"
            required
            placeholder="Nome completo"
            className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Válida até
          </label>
          <input
            name="validade"
            type="date"
            defaultValue={defaultValidade}
            required
            min={new Date().toISOString().split('T')[0]}
            className="mt-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Emitir
          </button>
          <button
            type="button"
            onClick={() => void closeForm()}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

interface SocioActionsProps {
  socioId: string
  validade: string
}

export function SocioActions({ socioId }: SocioActionsProps) {
  const [renovando, setRenovando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [novaValidade, setNovaValidade] = useState(getValidadePadrao)
  const confirmAction = useConfirmAction()

  function handleRenovar() {
    startTransition(async () => {
      const ok = await runPersistAction(() => renovarCarteirinha(socioId, novaValidade), {
        success: 'Carteirinha renovada.',
      })
      if (ok) setRenovando(false)
    })
  }

  async function handleRevogar() {
    await confirmAction({
      titulo: 'Revogar esta carteirinha?',
      descricao: 'Esta ação não pode ser desfeita.',
      labelConfirmar: 'Revogar',
      variante: 'destructive',
      cancelled: 'Revogação cancelada.',
      run: () => revogarCarteirinha(socioId),
      success: 'Carteirinha revogada.',
    })
  }

  if (pending) {
    return (
      <div className="flex justify-end">
        <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  if (renovando) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="date"
          value={novaValidade}
          onChange={(e) => setNovaValidade(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="app-action rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
        <button
          onClick={handleRenovar}
          className="app-action flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          <Check className="h-3 w-3" /> OK
        </button>
        <button
          onClick={() => setRenovando(false)}
          className="app-action rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button
        onClick={() => setRenovando(true)}
        className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        title="Renovar validade"
      >
        <RefreshCw className="h-3 w-3" />
        Renovar
      </button>
      <button
        onClick={() => void handleRevogar()}
        className="app-action flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        title="Revogar carteirinha"
      >
        <Trash2 className="h-3 w-3" />
        Revogar
      </button>
    </div>
  )
}
