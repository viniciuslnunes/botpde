'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import {
  baixarCobrancaManual,
  cancelarCobranca,
  dispararLembretesCobrancas,
  gerarPixCobranca,
} from './actions'
import { runPersistAction } from '@/lib/toast-action'

export function AdminCobrancaAcoes({
  cobrancaId,
  status,
}: {
  cobrancaId: string
  status: string
}) {
  const [pending, startTransition] = useTransition()
  const aberta = status === 'PENDENTE' || status === 'VENCIDA'

  function run(action: () => Promise<{ ok?: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      await runPersistAction(action, { success })
    })
  }

  if (!aberta && status !== 'PAGA') return null

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {aberta && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => gerarPixCobranca(cobrancaId), 'Pix gerado.')}
            className="rounded-md border border-[rgb(var(--border))] px-2 py-1 text-xs font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Gerar Pix'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => baixarCobrancaManual(cobrancaId), 'Baixa registrada.')}
            className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-300"
          >
            Baixar manual
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelarCobranca(cobrancaId), 'Cobrança cancelada.')}
            className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400"
          >
            Cancelar
          </button>
        </>
      )}
    </div>
  )
}

export function DispararLembretesButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await runPersistAction(dispararLembretesCobrancas, {
            success: 'Lembretes enviados.',
          })
        })
      }
      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
    >
      {pending ? 'Enviando…' : 'Disparar lembretes'}
    </button>
  )
}
