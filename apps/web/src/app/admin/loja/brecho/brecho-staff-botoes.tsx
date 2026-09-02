'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { runPersistAction } from '@/lib/toast-action'
import {
  atenderDenunciaBrechoAction,
  congelarLojaBrechoAction,
  resolverDenunciaBrechoAction,
} from './actions'
import { AppButton } from '@/components/ui/button'
import { Headset, ShieldCheck, X } from 'lucide-react'

export function BrechoStaffBotoes({
  denunciaId,
  lojaId,
  congelada,
  conversaId,
}: {
  denunciaId?: string
  lojaId?: string
  congelada?: boolean
  conversaId?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-wrap gap-2">
      {denunciaId ? (
        <>
          <AppButton
            variant="primary"
            icon={Headset}
            type="button"
            disabled={pending}
            className="rounded-lg px-3 text-sm font-semibold"
            onClick={() => {
              start(async () => {
                const r = await runPersistAction(
                  async () => {
                    const out = await atenderDenunciaBrechoAction(denunciaId)
                    return { ok: true as const, conversaId: out.conversaId }
                  },
                  { success: 'Você entrou na apuração.' },
                )
                if (r) router.refresh()
              })
            }}
          >
            Atender
          </AppButton>
          <AppButton
            variant="none"
            icon={ShieldCheck}
            type="button"
            disabled={pending}
            className="app-action rounded-lg border border-[rgb(var(--border))] px-3 text-sm"
            onClick={() => {
              start(async () => {
                const ok = await runPersistAction(
                  () => resolverDenunciaBrechoAction(denunciaId, 'RESOLVIDA', true),
                  { success: 'Denúncia procedente. Anúncio ocultado.' },
                )
                if (ok) router.refresh()
              })
            }}
          >
            Procedente
          </AppButton>
          <AppButton
            variant="none"
            icon={X}
            type="button"
            disabled={pending}
            className="app-action rounded-lg border border-[rgb(var(--border))] px-3 text-sm"
            onClick={() => {
              start(async () => {
                const ok = await runPersistAction(
                  () => resolverDenunciaBrechoAction(denunciaId, 'DESCARTADA'),
                  { success: 'Denúncia descartada.' },
                )
                if (ok) router.refresh()
              })
            }}
          >
            Descartar
          </AppButton>
        </>
      ) : null}
      {conversaId ? (
        <a href={`/portal/mensagens?c=${conversaId}`} className="app-action rounded-lg border px-3 text-sm">
          Conversa
        </a>
      ) : null}
      {lojaId ? (
        <button
          type="button"
          disabled={pending}
          className="app-action rounded-lg border px-3 text-sm"
          onClick={() => {
            start(async () => {
              const ok = await runPersistAction(
                () => congelarLojaBrechoAction(lojaId, !congelada),
                { success: congelada ? 'Loja reativada.' : 'Loja suspensa.' },
              )
              if (ok) router.refresh()
            })
          }}
        >
          {congelada ? 'Reativar loja' : 'Suspender loja'}
        </button>
      ) : null}
    </div>
  )
}
