'use client'

import { useTransition } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { promoverSedeAction } from '@/app/admin/(estrutura)/sedes/actions'
import { runPersistAction } from '@/lib/toast-action'

export function PromoverSedeButton({
  sedeId,
  sedeNome,
}: {
  sedeId: string
  sedeNome: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Building2 className="h-4 w-4" />
        Promover a tenant próprio
      </h3>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Transforma “{sedeNome}” em torcida afiliada com login e admin próprios (Caso B). Membros
        desta unidade e PDEs filhos migram automaticamente. A liderança vinculada vira owner do
        novo tenant.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Promover “${sedeNome}” a tenant próprio? Esta ação move membros e filhos territoriais.`,
            )
          ) {
            return
          }
          startTransition(async () => {
            await runPersistAction(() => promoverSedeAction(sedeId), {
              success: 'Unidade promovida a tenant.',
              successDescription: 'A Visão da torcida passa a listar o tenant afiliado.',
            })
          })
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-600 dark:hover:bg-amber-500"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
        Promover a tenant
      </button>
    </div>
  )
}
