import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Users,
  Clock,
  CreditCard,
  Calendar,
  MapPin,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Activity,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Admin' }

function formatarDataRelativa(data: Date) {
  const diff = Math.floor((Date.now() - new Date(data).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(data))
}

function formatarDataEvento(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data))
}

const acaoLabel: Record<string, string> = {
  CADASTRO_SOLICITADO: 'Solicitou filiação',
  RECADASTRO_SOLICITADO: 'Reenvio de cadastro',
  MEMBRO_APROVADO: 'Membro aprovado',
  MEMBRO_REPROVADO: 'Membro reprovado',
  MEMBRO_REVERTIDO: 'Aprovação revertida',
  CARTEIRINHA_EMITIDA: 'Carteirinha emitida',
  CARTEIRINHA_RENOVADA: 'Carteirinha renovada',
  CARTEIRINHA_REVOGADA: 'Carteirinha revogada',
  EVENTO_CRIADO: 'Evento criado',
  EVENTO_EDITADO: 'Evento editado',
  EVENTO_EXCLUIDO: 'Evento excluído',
  SEDE_CRIADA: 'Sede criada',
  SEDE_EDITADA: 'Sede editada',
  SEDE_ATIVADA: 'Sede ativada',
  SEDE_DESATIVADA: 'Sede desativada',
}

export default async function AdminPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/')

  const agora = new Date()
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)
  const ha30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalMembros,
    pendentes,
    reprovados,
    novosUltimos30d,
    totalSocios,
    sociosVencendo,
    sociosVencidos,
    proxEventos,
    totalSedes,
    sedesAtivas,
    auditLog,
    membroRecentes,
  ] = await Promise.all([
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'APROVADO' } }),
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'REPROVADO' } }),
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'APROVADO', aprovadoEm: { gte: ha30dias } } }),
    db.saasSocio.count({ where: { tenantId: tenant.id } }),
    db.saasSocio.count({ where: { tenantId: tenant.id, validade: { gte: agora, lte: em30dias } } }),
    db.saasSocio.count({ where: { tenantId: tenant.id, validade: { lt: agora } } }),
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { gte: agora } },
      orderBy: { data: 'asc' },
      take: 3,
      include: { _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } } },
    }),
    db.sede.count({ where: { tenantId: tenant.id } }),
    db.sede.count({ where: { tenantId: tenant.id, ativa: true } }),
    db.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { criadoEm: 'desc' },
      take: 8,
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', aprovadoEm: { not: null } },
      orderBy: { aprovadoEm: 'desc' },
      take: 5,
      select: { nome: true, tipo: true, aprovadoEm: true },
    }),
  ])

  type KpiCard = {
    label: string
    value: number
    icon: React.ElementType
    href?: string
    badge?: string
  }

  const kpis: KpiCard[] = [
    {
      label: 'Membros ativos',
      value: totalMembros,
      icon: Users,
      href: '/admin/membros',
      badge: novosUltimos30d > 0 ? `+${novosUltimos30d} este mês` : undefined,
    },
    {
      label: 'Aguardando aprovação',
      value: pendentes,
      icon: Clock,
      href: '/admin/membros',
    },
    {
      label: 'Sócios com carteirinha',
      value: totalSocios,
      icon: CreditCard,
      href: '/admin/socios',
    },
    {
      label: 'Próximos eventos',
      value: proxEventos.length,
      icon: Calendar,
      href: '/admin/eventos',
    },
  ]

  const secundarios = [
    { label: 'Sedes ativas', value: `${sedesAtivas} / ${totalSedes}`, icon: MapPin, href: '/admin/sedes' },
    { label: 'Cadastros reprovados', value: reprovados, icon: XCircle, cor: reprovados > 0 ? 'text-red-500' : undefined },
    { label: 'Carteirinhas vencendo (30d)', value: sociosVencendo, icon: AlertTriangle, cor: sociosVencendo > 0 ? 'text-yellow-500' : undefined, href: '/admin/socios' },
    { label: 'Carteirinhas vencidas', value: sociosVencidos, icon: XCircle, cor: sociosVencidos > 0 ? 'text-red-500' : undefined, href: '/admin/socios' },
  ]

  return (
    <div className="p-6 space-y-7">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Dashboard</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-[rgb(var(--foreground-muted))]">Operacional</span>
        </div>
      </div>

      {/* Alertas */}
      {(pendentes > 0 || sociosVencendo > 0 || sociosVencidos > 0) && (
        <div className="space-y-2">
          {pendentes > 0 && (
            <Link
              href="/admin/membros"
              className="flex items-center justify-between rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm hover:brightness-95 dark:border-yellow-800 dark:bg-yellow-950"
            >
              <span className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-200">
                <Clock className="h-4 w-4" />
                {pendentes} {pendentes === 1 ? 'membro aguarda' : 'membros aguardam'} aprovação
              </span>
              <ArrowRight className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </Link>
          )}
          {sociosVencidos > 0 && (
            <Link
              href="/admin/socios"
              className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm hover:brightness-95 dark:border-red-800 dark:bg-red-950"
            >
              <span className="flex items-center gap-2 font-medium text-red-800 dark:text-red-200">
                <XCircle className="h-4 w-4" />
                {sociosVencidos} carteirinha{sociosVencidos !== 1 ? 's' : ''} vencida{sociosVencidos !== 1 ? 's' : ''}
              </span>
              <ArrowRight className="h-4 w-4 text-red-500" />
            </Link>
          )}
          {sociosVencendo > 0 && (
            <Link
              href="/admin/socios"
              className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm hover:brightness-95 dark:border-orange-800 dark:bg-orange-950"
            >
              <span className="flex items-center gap-2 font-medium text-orange-800 dark:text-orange-200">
                <AlertTriangle className="h-4 w-4" />
                {sociosVencendo} carteirinha{sociosVencendo !== 1 ? 's' : ''} vence{sociosVencendo !== 1 ? 'm' : ''} em 30 dias
              </span>
              <ArrowRight className="h-4 w-4 text-orange-500" />
            </Link>
          )}
        </div>
      )}

      {/* KPIs principais — neutros por padrão; cor do tenant só no ícone */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon
          const inner = (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    {k.label}
                  </p>
                  <p className="mt-2 text-4xl font-bold text-[rgb(var(--foreground))]">{k.value}</p>
                  {k.badge && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-3 w-3" />
                      {k.badge}
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-[rgb(var(--background-subtle))] p-2.5">
                  <Icon className="h-5 w-5" style={{ color: tenant.corPrimaria }} />
                </div>
              </div>
            </div>
          )
          return k.href ? (
            <Link key={k.label} href={k.href} className="block transition-all hover:shadow-md">
              {inner}
            </Link>
          ) : (
            <div key={k.label}>{inner}</div>
          )
        })}
      </div>

      {/* Secundários */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {secundarios.map((s) => {
          const Icon = s.icon
          const inner = (
            <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <Icon className={`h-4 w-4 shrink-0 ${s.cor ?? 'text-[rgb(var(--foreground-muted))]'}`} />
              <div>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">{s.label}</p>
                <p className="font-semibold text-[rgb(var(--foreground))]">{s.value}</p>
              </div>
            </div>
          )
          return s.href ? (
            <Link key={s.label} href={s.href} className="block transition-all hover:shadow-sm">
              {inner}
            </Link>
          ) : (
            <div key={s.label}>{inner}</div>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximos eventos */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              Próximos eventos
            </h2>
            <Link href="/admin/eventos" className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]">
              Ver todos →
            </Link>
          </div>
          {proxEventos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Calendar className="mb-2 h-6 w-6 text-[rgb(var(--foreground-muted))]" />
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum evento agendado</p>
              <Link href="/admin/eventos" className="mt-2 text-xs text-[rgb(var(--foreground-muted))] underline hover:no-underline">
                Criar evento
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {proxEventos.map((e: (typeof proxEventos)[number]) => (
                <Link
                  key={e.id}
                  href={`/admin/eventos/${e.id}`}
                  className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 text-sm transition-all hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))] text-center leading-none">
                    <span className="text-xs font-bold text-[rgb(var(--foreground))]">
                      {new Date(e.data).getDate()}
                    </span>
                    <span className="text-[10px] text-[rgb(var(--foreground-muted))] uppercase">
                      {new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(e.data))}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[rgb(var(--foreground))]">{e.titulo}</p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {formatarDataEvento(new Date(e.data))}
                      {e.local ? ` · ${e.local}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                    {e._count.rsvps} ✓
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Membros recentes */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Membros aprovados recentemente
            </h2>
            <Link href="/admin/membros" className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]">
              Ver todos →
            </Link>
          </div>
          {membroRecentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="mb-2 h-6 w-6 text-[rgb(var(--foreground-muted))]" />
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum membro aprovado ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(membroRecentes as { nome: string; tipo: string; aprovadoEm: Date | null }[]).map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: tenant.corPrimaria }}
                    >
                      {m.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">{m.nome}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {m.tipo === 'SOCIO' ? 'Sócio' : 'Torcedor'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">
                    {m.aprovadoEm ? formatarDataRelativa(new Date(m.aprovadoEm)) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log de atividade */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Activity className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          Atividade recente
        </h2>
        {auditLog.length === 0 ? (
          <p className="py-4 text-center text-sm text-[rgb(var(--foreground-muted))]">Nenhuma atividade registrada</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--border))]">
            {(auditLog as { id: string; acao: string; entidade: string; entidadeId: string | null; criadoEm: Date }[]).map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--foreground-muted))]" />
                  <p className="text-sm text-[rgb(var(--foreground))]">
                    {acaoLabel[log.acao] ?? log.acao}
                  </p>
                  <span className="hidden text-xs text-[rgb(var(--foreground-muted))] sm:inline">
                    · {log.entidade}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                  {formatarDataRelativa(new Date(log.criadoEm))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
