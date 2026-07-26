'use client'

import { useTransition } from 'react'
import { runPersistAction } from '@/lib/toast-action'
import { alterarPlanoTenantAction } from '../torcidas/actions'

const PLANOS = ['FREE', 'BASIC', 'PREMIUM'] as const

export function TenantPlanoSelect({
  tenantId,
  plano,
}: {
  tenantId: string
  plano: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <select
      value={plano}
      disabled={pending}
      onChange={(e) => {
        const novoPlano = e.target.value
        if (novoPlano === plano) return
        startTransition(async () => {
          await runPersistAction(() => alterarPlanoTenantAction(tenantId, novoPlano), {
            success: `Plano atualizado para ${novoPlano}.`,
          })
        })
      }}
      className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] disabled:opacity-50"
    >
      {PLANOS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )
}
