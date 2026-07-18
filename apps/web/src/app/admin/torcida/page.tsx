import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import type { Tenant } from '@torcida/db'
import type { Metadata } from 'next'
import { assertPresidenteGlobal } from '@/lib/authz'
import { TorcidaConsole } from './_components/torcida-console'

export const metadata: Metadata = { title: 'Visão da torcida' }

function ConsoleSkeleton() {
  return (
    <div className="animate-pulse space-y-7">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
    </div>
  )
}

/**
 * Console global de LEITURA do Presidente/Vice: consolida afiliados e sócios
 * de toda a torcida (Sede + subsedes/PDEs). Nenhuma ação de gestão aqui — a
 * operação de cada unidade continua com a sua Liderança.
 */
export default async function TorcidaPage() {
  let tenant: Tenant
  try {
    ;({ tenant } = await assertPresidenteGlobal())
  } catch {
    redirect('/admin')
  }

  return (
    <div className="app-container space-y-7 py-8">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
            Presidência
          </p>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Visão da torcida</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
          <Eye className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Visão consolidada de leitura — cada unidade é gerida pela sua liderança
          </span>
        </div>
      </div>

      <Suspense fallback={<ConsoleSkeleton />}>
        <TorcidaConsole tenantId={tenant.id} tenantNome={tenant.nome} />
      </Suspense>
    </div>
  )
}
