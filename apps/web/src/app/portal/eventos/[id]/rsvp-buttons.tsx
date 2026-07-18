'use client'

import { useState, useTransition } from 'react'
import { m } from 'motion/react'
import { responderRsvp } from '../actions'
import { Loader2, UserCheck, UserX, Hourglass } from 'lucide-react'
import { springSnappy } from '@/lib/motion-presets'

type Props = {
  eventoId: string
  statusAtual: string | null
  lotacaoEsgotada?: boolean
}

export function RsvpButtons({ eventoId, statusAtual, lotacaoEsgotada = false }: Props) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(statusAtual)
  const [msg, setMsg] = useState<string | null>(null)

  function responder(next: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA') {
    startTransition(async () => {
      const res = await responderRsvp(eventoId, next)
      if (!res.ok) {
        setMsg(res.error)
        return
      }
      setStatus(res.status)
      if (next === 'CONFIRMADO' && res.status === 'LISTA_ESPERA') {
        setMsg('Lotação esgotada — você entrou na lista de espera.')
      } else {
        setMsg(null)
      }
    })
  }

  const mostrarEspera =
    lotacaoEsgotada || status === 'LISTA_ESPERA'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {!mostrarEspera || status === 'CONFIRMADO' ? (
          <m.button
            layout
            onClick={() => responder('CONFIRMADO')}
            disabled={pending}
            whileTap={{ scale: pending ? 1 : 0.96 }}
            transition={springSnappy}
            className={[
              'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60',
              status === 'CONFIRMADO'
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-2'
                : 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
            ].join(' ')}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            {status === 'CONFIRMADO' ? 'Confirmado ✓' : 'Vou comparecer'}
          </m.button>
        ) : (
          <m.button
            layout
            onClick={() => responder('LISTA_ESPERA')}
            disabled={pending || status === 'LISTA_ESPERA'}
            whileTap={{ scale: pending ? 1 : 0.96 }}
            transition={springSnappy}
            className={[
              'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60',
              status === 'LISTA_ESPERA'
                ? 'bg-amber-600 text-white ring-2 ring-amber-500 ring-offset-2'
                : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
            ].join(' ')}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Hourglass className="h-4 w-4" />
            )}
            {status === 'LISTA_ESPERA' ? 'Na lista de espera' : 'Entrar na lista de espera'}
          </m.button>
        )}

        <m.button
          layout
          onClick={() => responder('RECUSADO')}
          disabled={pending}
          whileTap={{ scale: pending ? 1 : 0.96 }}
          transition={springSnappy}
          className={[
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60',
            status === 'RECUSADO'
              ? 'bg-red-600 text-white ring-2 ring-red-500 ring-offset-2'
              : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserX className="h-4 w-4" />
          )}
          {status === 'RECUSADO' ? 'Recusado' : 'Não vou'}
        </m.button>
      </div>
      {msg && <p className="text-xs text-amber-700 dark:text-amber-400">{msg}</p>}
    </div>
  )
}
