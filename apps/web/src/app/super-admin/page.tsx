import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Building2, ClipboardCheck, LayoutDashboard, UserCheck, Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { KpiGrid } from '@/components/admin/ui/kpi-grid'
import { StatCard } from '@/components/admin/ui/stat-card'
import { TableShell } from '@/components/admin/ui/table-shell'
import { MiniBarChart } from '@/components/admin/charts'
import {
  carregarKpisPlataforma,
  listarTopTorcidasPorMembros,
  serieNovasTorcidasPorMes,
} from '@/lib/super-admin/plataforma-dashboard'

export const metadata: Metadata = { title: 'Visão geral — Super Admin' }

const MESES_SERIE = 6
const TOP_LIMITE = 5

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
      <div className="h-56 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="h-64 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
    </div>
  )
}

async function PlataformaOverview() {
  const [kpis, serie, top] = await Promise.all([
    carregarKpisPlataforma(),
    serieNovasTorcidasPorMes(MESES_SERIE),
    listarTopTorcidasPorMembros(TOP_LIMITE),
  ])

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <StatCard label="Torcidas ativas" value={kpis.torcidasAtivas} icon={<Building2 className="h-5 w-5" />} />
        <StatCard
          label="Novas torcidas (30d)"
          value={kpis.novasTorcidas30d}
          icon={<LayoutDashboard className="h-5 w-5" />}
        />
        <StatCard
          label="Membros aprovados"
          value={kpis.membrosAprovados}
          icon={<Users className="h-5 w-5" />}
          badge={`+${kpis.novosMembros30d} nos últimos 30d`}
        />
        <StatCard
          label="Afiliações pendentes"
          value={kpis.afiliacoesPendentes}
          icon={<ClipboardCheck className="h-5 w-5" />}
          href="/super-admin/afiliacoes"
          tone={kpis.afiliacoesPendentes > 0 ? 'warning' : 'default'}
        />
      </KpiGrid>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Novas torcidas por mês
        </h2>
        <div className="mt-4">
          <MiniBarChart
            data={serie.map((s) => ({ rotulo: s.rotulo, valor: s.valor }))}
            formato="numero"
          />
        </div>
      </section>

      <TableShell
        title="Top torcidas por membros"
        isEmpty={top.length === 0}
        empty={{
          icon: <UserCheck className="h-6 w-6" />,
          title: 'Nenhum torcedor aprovado ainda',
          description: 'O ranking aparece assim que houver membros aprovados em alguma torcida.',
        }}
      >
        <thead className="bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Torcida</th>
            <th className="px-3 py-2 text-right font-semibold">Membros aprovados</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--border))]">
          {top.map((t) => (
            <tr key={t.tenantId}>
              <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                <span className="font-medium">{t.nome}</span>
                <span className="ml-2 font-mono text-xs text-[rgb(var(--foreground-muted))]">{t.slug}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-[rgb(var(--foreground))]">
                {t.totalMembros}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Gerenciar torcidas específicas: <Link href="/super-admin/torcidas" className="underline">Torcidas</Link>.
      </p>
    </div>
  )
}

export default async function SuperAdminIndexPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }
  if (!session.user.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Visão geral da plataforma"
        description="Métricas agregadas de todas as torcidas — sem escopo de tenant."
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <Suspense fallback={<OverviewSkeleton />}>
          <PlataformaOverview />
        </Suspense>
      </div>
    </div>
  )
}
