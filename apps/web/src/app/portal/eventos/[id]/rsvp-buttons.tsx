'use client'

import { useTransition } from 'react'
import { responderRsvp } from '../actions'
import { Loader2, UserCheck, UserX } from 'lucide-react'

type Props = {
  eventoId: string
  statusAtual: string | null
}

export function RsvpButtons({ eventoId, statusAtual }: Props) {
  const [pending, startTransition] = useTransition()

  function responder(status: 'CONFIRMADO' | 'RECUSADO') {
    startTransition(async () => {
      await responderRsvp(eventoId, status)
    })
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={() => responder('CONFIRMADO')}
        disabled={pending}
        className={[
          'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60',
          statusAtual === 'CONFIRMADO'
            ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-2'
            : 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        ].join(' ')}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserCheck className="h-4 w-4" />
        )}
        {statusAtual === 'CONFIRMADO' ? 'Confirmado ✓' : 'Vou comparecer'}
      </button>

      <button
        onClick={() => responder('RECUSADO')}
        disabled={pending}
        className={[
          'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60',
          statusAtual === 'RECUSADO'
            ? 'bg-red-600 text-white ring-2 ring-red-500 ring-offset-2'
            : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
        ].join(' ')}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserX className="h-4 w-4" />
        )}
        {statusAtual === 'RECUSADO' ? 'Recusado' : 'Não vou'}
      </button>
    </div>
  )
}
