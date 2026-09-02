'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { inboxSincronizarCobrancasVencidas } from '@/app/admin/inbox-actions'
import { AppButton } from '@/components/ui/button'

/** Botão explícito — substitui write no GET da direção financeira. */
export function SincronizarCobrancasButton() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton
        type="button"
        variant="outline"
        size="sm"
        icon={RefreshCw}
        loading={pending}
        onClick={() => {
          setMsg(null)
          start(async () => {
            const r = await inboxSincronizarCobrancasVencidas()
            if (r.error) setMsg(r.error)
            else setMsg(`${r.atualizadas ?? 0} atualizada(s)`)
          })
        }}
      >
        Atualizar vencidas
      </AppButton>
      {msg ? <span className="text-xs text-[rgb(var(--foreground-muted))]">{msg}</span> : null}
    </div>
  )
}
