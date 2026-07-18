'use client'

import { useTransition } from 'react'
import { promoverDaListaEspera } from '@/app/admin/eventos/actions'
import { Loader2, ArrowUp } from 'lucide-react'

export function PromoverEsperaButton({
  eventoId,
  userId,
}: {
  eventoId: string
  userId: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await promoverDaListaEspera(eventoId, userId)
        })
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
      Promover
    </button>
  )
}
