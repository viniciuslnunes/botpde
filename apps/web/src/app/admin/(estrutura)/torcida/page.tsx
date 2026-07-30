import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import type { Tenant } from '@torcida/db'
import type { Metadata } from 'next'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission, assertPresidenteGlobal } from '@/lib/authz'
import { TorcidaConsole } from './_components/torcida-console'
import { TorcidaEstrutura } from './_components/torcida-estrutura'

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
 * Fallback para quem NÃO é Presidente de uma Sede raiz (subsede/PDE com tenant
 * próprio, ou admin sem TORCIDA_GLOBAL_VIEW): visão da estrutura da torcida,
 * que respeita o toggle R3 (`getWorktreeParaDescendente`). Sem acesso admin
 * (`SEDES_MANAGE`) → volta ao /admin.
 */
async function TorcidaEstruturaFallback() {
  let tenant: Tenant
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE))
  } catch {
    redirect('/admin')
  }
  return (
    <Suspense fallback={<ConsoleSkeleton />}>
      <TorcidaEstrutura tenantId={tenant.id} tenantNome={tenant.nome} />
    </Suspense>
  )
}

/**
 * Console global de LEITURA do Presidente/Vice: consolida afiliados e sócios
 * de toda a torcida (Sede + subsedes/PDEs). Nenhuma ação de gestão aqui — a
 * operação de cada unidade continua com a sua Liderança. Solicitações de
 * afiliação ficam em `/admin/afiliacoes` (Governança).
 */
export default async function TorcidaPage() {
  let tenant: Tenant
  try {
    ;({ tenant } = await assertPresidenteGlobal())
  } catch {
    return <TorcidaEstruturaFallback />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
        <Eye className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
        <span className="text-xs text-[rgb(var(--foreground-muted))]">
          Presidência · visão consolidada de leitura — cada unidade é gerida pela sua liderança
        </span>
      </div>

      <Suspense fallback={<ConsoleSkeleton />}>
        <TorcidaConsole tenantId={tenant.id} tenantNome={tenant.nome} />
      </Suspense>
    </div>
  )
}
