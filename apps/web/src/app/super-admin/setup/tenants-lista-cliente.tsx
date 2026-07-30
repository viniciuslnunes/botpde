'use client'

import { Building2 } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { TenantAtivoToggle } from './tenant-ativo-toggle'
import { TenantPlanoSelect } from './tenant-plano-select'
import { AtribuirOwnerButton } from './setup-form'

type TenantRow = { id: string; slug: string; nome: string; plano: string; ativo: boolean }

/**
 * Linhas da página atual — busca, filtros e paginação vivem no servidor
 * (`ListagemToolbar` / `ListagemPaginacao`). Aqui só hidratam as ações por linha.
 */
export function TenantsListaCliente({
  tenants,
  souOwnerDeIds,
}: {
  tenants: TenantRow[]
  souOwnerDeIds: string[]
}) {
  const souOwnerDe = new Set(souOwnerDeIds)

  return (
    <div className="space-y-2">
      {tenants.map((t) => (
        <div
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Building2 className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{t.nome}</p>
              <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">slug: {t.slug}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TenantAtivoToggle tenantId={t.id} nome={t.nome} ativo={t.ativo} />
            <TenantPlanoSelect tenantId={t.id} plano={t.plano} />
            {souOwnerDe.has(t.id) ? (
              <Badge variant="info">owner ✓</Badge>
            ) : (
              <AtribuirOwnerButton tenantId={t.id} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
