'use client'

import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { inboxSincronizarCobrancasVencidas } from '@/app/admin/inbox-actions'

/** Botão explícito — substitui write no GET da direção financeira. */
export function SincronizarCobrancasButton() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null)
          start(async () => {
            const r = await inboxSincronizarCobrancasVencidas()
            if (r.error) setMsg(r.error)
            else setMsg(`${r.atualizadas ?? 0} atualizada(s)`)
          })
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        )}
        Atualizar vencidas
      </button>
      {msg ? <span className="text-xs text-[rgb(var(--foreground-muted))]">{msg}</span> : null}
    </div>
  )
}
