'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, UserCheck } from 'lucide-react'
import { transferirOwnerAction, type TransferirOwnerState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
      {pending ? 'Transferindo...' : 'Transferir'}
    </button>
  )
}

export function TransferirOwnerForm({
  tenantId,
  ownerAtual,
}: {
  tenantId: string
  ownerAtual: string | null
}) {
  const [state, action] = useActionState<TransferirOwnerState, FormData>(transferirOwnerAction, {})

  useEffect(() => {
    if (state.success) {
      // Recarrega a lista após transferência bem-sucedida.
      window.location.reload()
    }
  }, [state.success])

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="min-w-0 flex-1">
        <input
          name="email"
          type="email"
          required
          placeholder={ownerAtual ? 'Novo e-mail do presidente' : 'E-mail do presidente'}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        {state.errors?.email?.[0] && (
          <p className="mt-1 text-xs text-red-400">{state.errors.email[0]}</p>
        )}
        {state.message && !state.success && (
          <p className="mt-1 text-xs text-red-400">{state.message}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  )
}
