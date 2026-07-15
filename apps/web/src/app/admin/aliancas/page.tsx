import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Handshake } from 'lucide-react'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { listAliancasForTenant, listRecomendacoesForTenant } from '@/lib/aliancas'
import { AliancaForms } from '@/components/admin/alianca-forms'
import { PERMISSIONS } from '@torcida/types'

export const metadata: Metadata = { title: 'Alianças — Admin' }

interface TenantOption {
  id: string
  nome: string
  slug: string
  afiliacao: {
    nome: string
    apelido: string | null
    cidade: string | null
    estado: string | null
  } | null
}

export default async function AdminAliancasPage() {
  const authz = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE).catch(() => null)
  if (!authz) {
    redirect('/admin')
  }

  const [aliancas, recomendacoes, tenants]: [
    Awaited<ReturnType<typeof listAliancasForTenant>>,
    Awaited<ReturnType<typeof listRecomendacoesForTenant>>,
    TenantOption[],
  ] = await Promise.all([
    listAliancasForTenant(authz.tenant.id),
    listRecomendacoesForTenant(authz.tenant.id),
    db.tenant.findMany({
      where: { ativo: true, id: { not: authz.tenant.id } },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        slug: true,
        afiliacao: {
          select: { nome: true, apelido: true, cidade: true, estado: true },
        },
      },
    }),
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Handshake className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Alianças</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Parcerias entre torcidas, propostas e recomendações da base de conhecimento.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container">
          <AliancaForms
            tenantId={authz.tenant.id}
            aliancas={aliancas}
            recomendacoes={recomendacoes}
            tenants={tenants}
          />
        </div>
      </div>
    </div>
  )
}
