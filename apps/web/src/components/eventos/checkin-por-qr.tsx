'use client'

import { useState, useTransition } from 'react'
import { registrarCheckInPorQr } from '@/app/admin/eventos/actions'
import { QrCode } from 'lucide-react'

type State = { ok?: boolean; error?: string; nome?: string }

export function CheckInPorQr({ eventoId }: { eventoId: string }) {
  const [payload, setPayload] = useState('')
  const [pending, start] = useTransition()
  const [state, setState] = useState<State>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({})
    start(async () => {
      const result = await registrarCheckInPorQr(eventoId, payload.trim())
      setState(result)
      if (result.ok) setPayload('')
    })
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
    >
      <label className="flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--foreground))]">
        <QrCode className="h-3.5 w-3.5 text-[rgb(var(--primary))]" />
        Check-in pela carteirinha (QR)
      </label>
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Cole o código do QR ou o parâmetro <code className="font-mono">t</code> da validação.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder="token.assinatura"
          className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-mono"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={pending || !payload.trim()}
          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? '…' : 'Registrar'}
        </button>
      </div>
      {state.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.ok && state.nome && (
        <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Check-in ok: {state.nome}
        </p>
      )}
    </form>
  )
}
