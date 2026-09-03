'use client'

import { useActionState, useEffect } from 'react'
import { CalendarClock, Save } from 'lucide-react'
import { toast } from '@torcida/ui'
import { parseFinanceiroCiclo } from '@torcida/types'

type FinanceiroCiclo = ReturnType<typeof parseFinanceiroCiclo>
import {
  salvarFinanceiroCiclo,
  type FinanceiroCicloState,
} from '@/app/admin/financeiro/planos/ciclo-actions'
import { AppButton } from '@/components/ui/button'

type Props = {
  ciclo: FinanceiroCiclo
  somenteLeitura?: boolean
}

export function FinanceiroCicloForm({ ciclo, somenteLeitura = false }: Props) {
  const [state, action, pending] = useActionState<FinanceiroCicloState, FormData>(
    salvarFinanceiroCiclo,
    {},
  )

  useEffect(() => {
    if (state.success && state.message) toast.success(state.message)
    if (state.message && !state.success) toast.error(state.message)
  }, [state.success, state.message])

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Ciclo automático</h2>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Gera mensalidades no dia escolhido e dispara lembretes na régua (cron diário). Idempotente
            por competência mensal.
          </p>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <label className="flex items-center gap-3 text-sm text-[rgb(var(--foreground))]">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={ciclo.ativo}
            disabled={somenteLeitura || pending}
            className="h-4 w-4 rounded border-[rgb(var(--border))]"
          />
          Ativar geração e régua automáticas
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[rgb(var(--foreground-muted))]">Dia da geração (1–28)</span>
            <input
              type="number"
              name="diaGeracao"
              min={1}
              max={28}
              defaultValue={ciclo.diaGeracao}
              disabled={somenteLeitura || pending}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[rgb(var(--foreground-muted))]">Dias até vencimento</span>
            <input
              type="number"
              name="diasParaVencimento"
              min={1}
              max={60}
              defaultValue={ciclo.diasParaVencimento}
              disabled={somenteLeitura || pending}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-[rgb(var(--foreground-muted))]">Régua (dias após vencer)</span>
            <input
              type="text"
              name="diasRegua"
              defaultValue={ciclo.diasRegua.join(',')}
              disabled={somenteLeitura || pending}
              placeholder="0, 7, 14"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2"
            />
          </label>
        </div>

        {state.errors ? (
          <ul className="text-sm text-[rgb(var(--color-danger-fg))]">
            {Object.entries(state.errors).flatMap(([k, msgs]) =>
              (msgs ?? []).map((m) => <li key={`${k}-${m}`}>{m}</li>),
            )}
          </ul>
        ) : null}

        {!somenteLeitura ? (
          <AppButton type="submit" variant="primary" icon={Save} disabled={pending}>
            Salvar ciclo
          </AppButton>
        ) : null}
      </form>
    </section>
  )
}
