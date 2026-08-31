'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmarTrocaBrechoAction } from '../actions'
import { runPersistAction } from '@/lib/toast-action'

export function BrechoConfirmarButton({
  interesseId,
  jaConfirmou,
}: {
  interesseId: string
  jaConfirmou: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (jaConfirmou) {
    return (
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Você confirmou. Esperando o outro lado.
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      className="app-action inline-flex items-center justify-center rounded-xl border border-[rgb(var(--border))] px-4 font-medium"
      onClick={() => {
        start(async () => {
          const ok = await runPersistAction(() => confirmarTrocaBrechoAction(interesseId), {
            success: 'Confirmação registrada.',
          })
          if (ok) router.refresh()
        })
      }}
    >
      {pending ? 'Confirmando…' : 'Confirmar que recebi / entreguei'}
    </button>
  )
}
