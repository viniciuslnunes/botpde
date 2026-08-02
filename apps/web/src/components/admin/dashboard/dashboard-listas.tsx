'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Activity, Calendar, CheckCircle2, Users } from 'lucide-react'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface DashboardEventoView {
  id: string
  titulo: string
  /** Dia do mês (ex.: "27"). */
  dia: string
  /** Mês curto (ex.: "jul"). */
  mesCurto: string
  dataLabel: string
  local: string | null
  confirmados: number
}

export interface DashboardMembroView {
  nome: string
  inicial: string
  tipoLabel: string
  aprovadoLabel: string
}

export interface DashboardAuditoriaView {
  id: string
  acaoLabel: string
  entidade: string
  quandoLabel: string
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      variants={staggerItem}
      className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5"
    >
      {children}
    </m.div>
  )
}

/** Listas do dashboard: próximos eventos, aprovados recentes e auditoria. */
export function DashboardListas({
  eventos,
  membros,
  auditoria,
  corPrimaria,
}: {
  eventos: DashboardEventoView[]
  membros: DashboardMembroView[]
  auditoria: DashboardAuditoriaView[]
  corPrimaria: string
}) {
  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-7">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximos eventos */}
        <CardShell>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <Calendar className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" aria-hidden />
              Próximos eventos
            </h2>
            <Link
              href="/admin/eventos"
              className="shrink-0 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Ver todos →
            </Link>
          </div>
          {eventos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Calendar className="mb-2 h-6 w-6 text-[rgb(var(--foreground-muted))]" aria-hidden />
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum evento agendado</p>
              <Link
                href="/admin/eventos"
                className="mt-2 text-xs text-[rgb(var(--foreground-muted))] underline hover:no-underline"
              >
                Criar evento
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {eventos.map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/eventos/${e.id}`}
                  className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 text-sm transition-all hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))] text-center leading-none">
                    <span className="text-xs font-bold text-[rgb(var(--foreground))]">{e.dia}</span>
                    <span className="text-[10px] uppercase text-[rgb(var(--foreground-muted))]">
                      {e.mesCurto}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[rgb(var(--foreground))]">{e.titulo}</p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {e.dataLabel}
                      {e.local ? ` · ${e.local}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                    {e.confirmados} ✓
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardShell>

        {/* Membros recentes */}
        <CardShell>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-balance font-semibold text-[rgb(var(--foreground))]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-success-fg))]" aria-hidden />
              Membros aprovados recentemente
            </h2>
            <Link
              href="/admin/torcedores"
              className="shrink-0 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Ver todos →
            </Link>
          </div>
          {membros.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="mb-2 h-6 w-6 text-[rgb(var(--foreground-muted))]" aria-hidden />
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum membro aprovado ainda
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {membros.map((membro, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      {membro.inicial}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                        {membro.nome}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {membro.tipoLabel}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">
                    {membro.aprovadoLabel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      </div>

      {/* Log de atividade */}
      <CardShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
            <Activity className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" aria-hidden />
            Atividade recente
          </h2>
          <Link
            href="/admin/auditoria"
            className="shrink-0 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Ver registro →
          </Link>
        </div>
        {auditoria.length === 0 ? (
          <p className="py-4 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma atividade registrada
          </p>
        ) : (
          <div className="divide-y divide-[rgb(var(--border))]">
            {auditoria.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--foreground-muted))]" />
                  <p className="text-sm text-[rgb(var(--foreground))]">{log.acaoLabel}</p>
                  <span className="hidden text-xs text-[rgb(var(--foreground-muted))] sm:inline">
                    · {log.entidade}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                  {log.quandoLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardShell>
    </m.div>
  )
}
