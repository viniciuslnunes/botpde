import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  Calendar,
  Clock,
  CreditCard,
  MapPin,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import type { Metadata } from 'next'
import { formatarMoedaBRL } from '@torcida/types'
import { AdminPageHeader, KpiGrid, StatCard } from '@/components/admin/ui'
import { DashboardAlertas, type DashboardAlerta } from '@/components/admin/dashboard/dashboard-alertas'
import {
  DashboardListas,
  type DashboardAuditoriaView,
  type DashboardEventoView,
  type DashboardMembroView,
} from '@/components/admin/dashboard/dashboard-listas'
import {
  carregarKpisDashboard,
  carregarListasDashboard,
  carregarReceitaMesDashboard,
  carregarSerieNovosMembros,
} from '@/lib/admin-dashboard'
import { labelAcaoAuditoria } from '@/lib/audit-labels'

export const metadata: Metadata = { title: 'Dashboard — Admin' }

function formatarDataRelativa(data: Date) {
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(data))
}

function formatarDataEvento(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

function KpisSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}

function ListasSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-64 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      </div>
      <div className="h-56 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
    </div>
  )
}

async function DashboardKpis({ tenantId }: { tenantId: string }) {
  const [kpis, serieNovos, receita] = await Promise.all([
    carregarKpisDashboard(tenantId),
    carregarSerieNovosMembros(tenantId, '30d'),
    carregarReceitaMesDashboard(tenantId),
  ])

  const alertas: DashboardAlerta[] = []
  if (kpis.pendentes > 0) {
    alertas.push({
      href: '/admin/membros',
      label: `${kpis.pendentes} ${kpis.pendentes === 1 ? 'membro aguarda' : 'membros aguardam'} aprovação`,
      variant: 'yellow',
    })
  }
  if (kpis.sociosVencidos > 0) {
    alertas.push({
      href: '/admin/socios',
      label: `${kpis.sociosVencidos} carteirinha${kpis.sociosVencidos !== 1 ? 's' : ''} vencida${kpis.sociosVencidos !== 1 ? 's' : ''}`,
      variant: 'red',
    })
  }
  if (kpis.sociosVencendo > 0) {
    alertas.push({
      href: '/admin/socios',
      label: `${kpis.sociosVencendo} carteirinha${kpis.sociosVencendo !== 1 ? 's' : ''} vence${kpis.sociosVencendo !== 1 ? 'm' : ''} em 30 dias`,
      variant: 'orange',
    })
  }

  return (
    <div className="space-y-7">
      <DashboardAlertas alertas={alertas} />

      <KpiGrid>
        <StatCard
          label="Membros ativos"
          value={kpis.totalMembros}
          icon={<Users className="h-5 w-5" />}
          href="/admin/membros"
          badge={kpis.novosUltimos30d > 0 ? `+${kpis.novosUltimos30d} este mês` : undefined}
          sparkline={serieNovos.map((p) => p.valor)}
        />
        <StatCard
          label="Aguardando aprovação"
          value={kpis.pendentes}
          icon={<Clock className="h-5 w-5" />}
          href="/admin/membros"
        />
        <StatCard
          label="Sócios com carteirinha"
          value={kpis.totalSocios}
          icon={<CreditCard className="h-5 w-5" />}
          href="/admin/socios"
        />
        <StatCard
          label="Próximos eventos"
          value={kpis.proxEventosCount}
          icon={<Calendar className="h-5 w-5" />}
          href="/admin/eventos"
        />
      </KpiGrid>

      <KpiGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          compact
          label="Receita do mês"
          value={formatarMoedaBRL(receita.receitaMes)}
          icon={<Wallet className="h-4 w-4" />}
          href="/admin/financeiro"
          delta={{ atual: receita.receitaMes, anterior: receita.receitaMesAnterior }}
        />
        <StatCard
          compact
          label="Sedes ativas"
          value={`${kpis.sedesAtivas} / ${kpis.totalSedes}`}
          icon={<MapPin className="h-4 w-4" />}
          href="/admin/sedes"
        />
        <StatCard
          compact
          label="Cadastros reprovados"
          value={kpis.reprovados}
          icon={<XCircle className="h-4 w-4" />}
          tone={kpis.reprovados > 0 ? 'danger' : 'default'}
        />
        <StatCard
          compact
          label="Carteirinhas vencendo (30d)"
          value={kpis.sociosVencendo}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={kpis.sociosVencendo > 0 ? 'warning' : 'default'}
          href="/admin/socios"
        />
        <StatCard
          compact
          label="Carteirinhas vencidas"
          value={kpis.sociosVencidos}
          icon={<XCircle className="h-4 w-4" />}
          tone={kpis.sociosVencidos > 0 ? 'danger' : 'default'}
          href="/admin/socios"
        />
      </KpiGrid>
    </div>
  )
}

async function DashboardListasSection({
  tenantId,
  corPrimaria,
}: {
  tenantId: string
  corPrimaria: string
}) {
  const { proxEventos, membrosRecentes, auditoria } = await carregarListasDashboard(tenantId)

  const eventos: DashboardEventoView[] = proxEventos.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    dia: String(new Date(e.data).getDate()),
    mesCurto: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(e.data)),
    dataLabel: formatarDataEvento(e.data),
    local: e.local,
    confirmados: e.confirmados,
  }))

  const membros: DashboardMembroView[] = membrosRecentes.map((m) => ({
    nome: m.nome,
    inicial: m.nome.charAt(0).toUpperCase(),
    tipoLabel: m.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor',
    aprovadoLabel: m.aprovadoEm ? formatarDataRelativa(m.aprovadoEm) : '—',
  }))

  const logs: DashboardAuditoriaView[] = auditoria.map((log) => ({
    id: log.id,
    acaoLabel: labelAcaoAuditoria(log.acao),
    entidade: log.entidade,
    quandoLabel: formatarDataRelativa(log.criadoEm),
  }))

  return (
    <DashboardListas eventos={eventos} membros={membros} auditoria={logs} corPrimaria={corPrimaria} />
  )
}

export default async function AdminPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/')

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Dashboard"
        description={tenant.nome}
        actions={
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[rgb(var(--color-success))]" />
            <span className="text-xs text-[rgb(var(--foreground-muted))]">Operacional</span>
          </div>
        }
      />

      <div className="app-container min-w-0 flex-1 space-y-7 py-5 sm:py-8">
        <Suspense fallback={<KpisSkeleton />}>
          <DashboardKpis tenantId={tenant.id} />
        </Suspense>

        <Suspense fallback={<ListasSkeleton />}>
          <DashboardListasSection tenantId={tenant.id} corPrimaria={tenant.corPrimaria} />
        </Suspense>
      </div>
    </div>
  )
}
