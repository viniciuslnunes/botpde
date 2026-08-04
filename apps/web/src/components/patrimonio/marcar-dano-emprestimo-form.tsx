'use client'

import { useActionState } from 'react'
import {
  marcarDanoEmprestimoPatrimonio,
  type EmprestimoState,
} from '@/app/portal/patrimonio/emprestimo-actions'

const initial: EmprestimoState = {}

export function MarcarDanoEmprestimoForm({ emprestimoId }: { emprestimoId: string }) {
  const [state, action, pending] = useActionState(marcarDanoEmprestimoPatrimonio, initial)

  if (state.ok) {
    return <p className="text-xs text-[rgb(var(--color-warning-fg))]">Dano registrado — item em manutenção.</p>
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="emprestimoId" value={emprestimoId} />
      <label className="min-w-[12rem] flex-1 text-xs">
        <span className="mb-1 block text-[rgb(var(--foreground-muted))]">Descrever dano</span>
        <input
          name="danoObservacao"
          required
          minLength={3}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-sm"
          placeholder="Ex.: pele rasgada"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-[rgb(var(--color-warning-fg)_/_0.4)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-warning-fg))] disabled:opacity-50"
      >
        {pending ? '…' : 'Marcar dano'}
      </button>
      {state.error ? (
        <p className="w-full text-xs text-[rgb(var(--color-danger-fg))]">{state.error}</p>
      ) : null}
    </form>
  )
}
