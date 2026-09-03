import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { assertStoreView } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { LojaTicketKanbanSection } from '@/components/loja/loja-ticket-kanban-section'
import { LojaTicketKanbanSkeleton } from '@/components/loja/loja-ticket-kanban'
import { LojaTicketsArquivo } from '@/components/loja/loja-tickets-arquivo'
import type { ArquivoTicketsFiltro } from '@/lib/loja-ticket'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Atendimento — Loja Admin' }

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function tabClass(ativa: boolean) {
  return [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    ativa
      ? 'bg-[rgb(var(--primary))] text-primary-on'
      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
  ].join(' ')
}

export default async function AdminLojaAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let tenant: Awaited<ReturnType<typeof assertStoreView>>['tenant']
  let session: Awaited<ReturnType<typeof assertStoreView>>['session']
  try {
    ;({ tenant, session } = await assertStoreView())
  } catch {
    redirect('/admin')
  }

  let podeGerir = false
  if (isSuperAdminEmail(session.user?.email)) {
    podeGerir = true
  } else if (session.user?.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
    podeGerir = hasPermission(efetivas, PERMISSIONS.STORE_MANAGE)
  }

  const params = await searchParams
  const vista = firstParam(params.v) === 'arquivo' ? 'arquivo' : 'fila'
  const filtroRaw = firstParam(params.filtro) ?? 'fechados'
  const filtro: ArquivoTicketsFiltro =
    filtroRaw === 'abertos' || filtroRaw === 'todos' || filtroRaw === 'fechados'
      ? filtroRaw
      : 'fechados'
  const busca = firstParam(params.q)?.trim() ?? ''
  const pagina = Math.max(1, Number(firstParam(params.pagina) ?? '1') || 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/loja/atendimento" className={tabClass(vista === 'fila')}>
          Fila ao vivo
        </Link>
        <Link href="/admin/loja/atendimento?v=arquivo" className={tabClass(vista === 'arquivo')}>
          Arquivo
        </Link>
      </div>

      {vista === 'fila' ? (
        <Suspense fallback={<LojaTicketKanbanSkeleton mostrarCabecalho={false} />}>
          <LojaTicketKanbanSection
            tenantId={tenant.id}
            podeGerir={podeGerir}
            mostrarCabecalho={false}
            arquivoHref="/admin/loja/atendimento?v=arquivo"
          />
        </Suspense>
      ) : (
        <Suspense fallback={<p className="text-sm text-[rgb(var(--foreground-muted))]">Carregando arquivo…</p>}>
          <LojaTicketsArquivo
            tenantId={tenant.id}
            filtro={filtro}
            busca={busca}
            pagina={pagina}
          />
        </Suspense>
      )}
    </div>
  )
}
