'use client'

import { useState, useTransition } from 'react'
import { responderRsvp } from '@/app/portal/eventos/actions'
import { Loader2, UserCheck, UserX, Hourglass } from 'lucide-react'

/** RSVP compacto para cards da lista — não navega ao clicar. */
export function RsvpInline({
  eventoId,
  statusAtual,
  lotacaoEsgotada = false,
}: {
  eventoId: string
  statusAtual?: string | null
  lotacaoEsgotada?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(statusAtual ?? null)

  function responder(
    e: React.MouseEvent,
    next: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA',
  ) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const res = await responderRsvp(eventoId, next)
      if (res.ok) setStatus(res.status)
    })
  }

  const mostrarEspera = lotacaoEsgotada || status === 'LISTA_ESPERA'

  return (
    <div
      className="flex flex-wrap gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {!mostrarEspera || status === 'CONFIRMADO' ? (
        <button
          type="button"
          disabled={pending}
          onClick={(e) => responder(e, 'CONFIRMADO')}
          className={[
            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60',
            status === 'CONFIRMADO'
              ? 'btn-success'
              : 'btn-success-soft',
          ].join(' ')}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
          {status === 'CONFIRMADO' ? 'Vou' : 'Confirmar'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending || status === 'LISTA_ESPERA'}
          onClick={(e) => responder(e, 'LISTA_ESPERA')}
          className={[
            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60',
            status === 'LISTA_ESPERA'
              ? 'bg-amber-600 text-white'
              : 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
          ].join(' ')}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hourglass className="h-3 w-3" />}
          {status === 'LISTA_ESPERA' ? 'Espera' : 'Fila'}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={(e) => responder(e, 'RECUSADO')}
        className={[
          'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60',
          status === 'RECUSADO'
            ? 'bg-red-600 text-white'
            : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
        ].join(' ')}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
        {status === 'RECUSADO' ? 'Não' : 'Recusar'}
      </button>
    </div>
  )
}
