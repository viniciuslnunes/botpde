'use client'

import { useMemo, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { TenantAtivoToggle } from './tenant-ativo-toggle'
import { TenantPlanoSelect } from './tenant-plano-select'
import { AtribuirOwnerButton } from './setup-form'

type TenantRow = { id: string; slug: string; nome: string; plano: string; ativo: boolean }

export function TenantsListaCliente({
  tenants,
  souOwnerDeIds,
}: {
  tenants: TenantRow[]
  souOwnerDeIds: string[]
}) {
  const [busca, setBusca] = useState('')
  const souOwnerDe = useMemo(() => new Set(souOwnerDeIds), [souOwnerDeIds])

  const filtrados = useMemo(() => {
    const alvo = normalizarTexto(busca)
    if (!alvo) return tenants
    return tenants.filter((t) => normalizarTexto(`${t.nome} ${t.slug}`).includes(alvo))
  }, [busca, tenants])

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou slug…"
          className="w-full max-w-sm rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-1.5 pl-8 pr-3 text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
          aria-label="Buscar torcida"
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhuma torcida encontrada.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">{t.nome}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">slug: {t.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
      )}
    </div>
  )
}
