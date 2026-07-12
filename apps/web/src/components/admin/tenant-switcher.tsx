'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import {
  selecionarTorcidaAction,
  type SelecionarTorcidaState,
} from '@/app/admin/tenant-context-actions'
import type { TorcidaOpcao } from '@/lib/tenant-context'

function SubmitOnChange({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus()
  const busy = pending || formPending
  if (busy) {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden />
  }
  return null
}

type Props = {
  torcidas: TorcidaOpcao[]
  torcidaAtualSlug: string | null
  destino?: 'admin' | 'portal' | 'super-admin'
  variant?: 'admin' | 'super-admin'
}

export function TenantSwitcher({
  torcidas,
  torcidaAtualSlug,
  destino = 'admin',
  variant = 'admin',
}: Props) {
  const [state, action, pending] = useActionState<SelecionarTorcidaState, FormData>(
    selecionarTorcidaAction,
    {},
  )

  useEffect(() => {
    if (state.message) {
      // eslint-disable-next-line no-alert
      alert(state.message)
    }
  }, [state.message])

  const selectClass =
    variant === 'super-admin'
      ? 'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
      : 'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary))]'

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="destino" value={destino} />
      <label
        className={
          variant === 'super-admin'
            ? 'text-xs font-medium text-zinc-500'
            : 'text-xs font-medium text-[rgb(var(--foreground-muted))]'
        }
      >
        Torcida ativa
      </label>
      <div className="flex items-center gap-2">
        <select
          name="slug"
          defaultValue={torcidaAtualSlug ?? ''}
          className={selectClass}
          onChange={(e) => {
            if (e.target.value) {
              const form = e.target.form
              if (form) form.requestSubmit()
            }
          }}
          disabled={pending}
        >
          <option value="" disabled>
            Selecione uma torcida…
          </option>
          {torcidas.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.nome}
            </option>
          ))}
        </select>
        <SubmitOnChange pending={pending} />
      </div>
      {variant === 'super-admin' && (
        <p className="text-xs text-zinc-500">
          Ao trocar, você entra no admin da torcida escolhida (membros, aprovações, eventos…).
        </p>
      )}
    </form>
  )
}
