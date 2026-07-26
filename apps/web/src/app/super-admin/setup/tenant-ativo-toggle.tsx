'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { runPersistAction } from '@/lib/toast-action'
import { alternarAtivoTenantAction } from '../torcidas/actions'

const CLASS_BASE =
  'flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50'

const CLASS_ATIVO = 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]'
const CLASS_INATIVO = 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'

export function TenantAtivoToggle({
  tenantId,
  nome,
  ativo,
}: {
  tenantId: string
  nome: string
  ativo: boolean
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const confirmMsg = ativo
          ? `Suspender "${nome}"? A torcida deixa de aparecer no login e no portal imediatamente.`
          : `Reativar "${nome}"? A torcida volta a aparecer no login e no portal imediatamente.`
        if (!window.confirm(confirmMsg)) return

        startTransition(async () => {
          await runPersistAction(() => alternarAtivoTenantAction(tenantId, !ativo), {
            success: ativo ? `${nome} suspensa.` : `${nome} reativada.`,
          })
        })
      }}
      className={`${CLASS_BASE} ${ativo ? CLASS_ATIVO : CLASS_INATIVO}`}
      title={ativo ? 'Clique para suspender' : 'Clique para reativar'}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {ativo ? 'Ativo' : 'Inativo'}
    </button>
  )
}
