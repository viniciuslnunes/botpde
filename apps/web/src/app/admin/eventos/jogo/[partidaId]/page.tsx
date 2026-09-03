import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  MapPin,
  Package,
  Ticket,
  Users,
} from 'lucide-react'
import { hasPermission, PERMISSIONS, TIPO_EVENTO_LABEL } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { AdminDetailHeader, KpiGrid, StatCard } from '@/components/admin/ui'
import { carregarDiaDeJogo } from '@/lib/dia-de-jogo'

export const metadata: Metadata = { title: 'Dia de Jogo — Agenda' }

const ICONE_KPI = 'h-5 w-5'

function formatarDataHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(data))
}

function faltaLabel(horas: number): string {
  if (horas < 0) return 'Jogo já passou'
  if (horas < 1) return 'Menos de 1h'
  if (horas < 48) return `Faltam ${Math.round(horas)}h`
  return `Faltam ${Math.round(horas / 24)} dias`
}

/**
 * Dia de Jogo — o que a torcida realmente opera. Junta, em volta da partida,
 * as operações do dia (caravana, ensaio, ação na sede) com a cobertura da
 * escala e o material que saiu. Só leitura: cada ação continua no módulo dono.
 */
export default async function DiaDeJogoPage({
  params,
}: {
  params: Promise<{ partidaId: string }>
}) {
  const { partidaId } = await params

  let tenantId: string
  let podeGerir = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    tenantId = authz.tenant.id
    podeGerir =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.EVENTS_MANAGE)
  } catch {
    redirect('/admin')
  }

  const dia = await carregarDiaDeJogo(tenantId, partidaId)
  if (!dia) notFound()

  const { partida, operacoes, totais, arquibancada } = dia
  const mando = partida.mando === 'CASA' ? 'Casa' : 'Fora'

  return (
    <div className="app-container space-y-6 py-8">
      <AdminDetailHeader
        title={`Dia de Jogo · ${partida.adversario}`}
        backHref="/admin/eventos"
        backLabel="Agenda"
        description={[
          formatarDataHora(partida.dataHora),
          mando,
          partida.competicao,
          partida.local,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <KpiGrid>
        <StatCard
          label="Operações do dia"
          value={totais.operacoes}
          icon={<CalendarDays className={ICONE_KPI} />}
          badge={faltaLabel(dia.horasAteJogo)}
        />
        <StatCard
          label="Confirmados"
          value={totais.confirmados}
          icon={<Users className={ICONE_KPI} />}
        />
        <StatCard
          label="Postos na escala"
          value={totais.postos}
          icon={<ClipboardList className={ICONE_KPI} />}
          tone={totais.semCoordenacao > 0 ? 'danger' : 'default'}
          badge={
            totais.postosSemResposta > 0 ? `${totais.postosSemResposta} sem resposta` : undefined
          }
          badgeTone="warning"
        />
        <StatCard
          label="Material em campo"
          value={totais.materialEmCampo}
          icon={<Package className={ICONE_KPI} />}
          tone={totais.materialEmCampo > 0 ? 'warning' : 'default'}
        />
      </KpiGrid>

      {totais.semCoordenacao > 0 && (
        <p className="rounded-xl border border-[rgb(var(--color-danger)_/_0.35)] bg-[rgb(var(--color-danger)_/_0.08)] px-4 py-3 text-sm text-[rgb(var(--foreground))]">
          {totais.semCoordenacao === 1
            ? 'Uma operação deste jogo está sem coordenação — ninguém responde por ela.'
            : `${totais.semCoordenacao} operações deste jogo estão sem coordenação.`}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Operações</h2>

        {operacoes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma operação vinculada a este jogo ainda.
            {podeGerir ? ' Crie a caravana ou vincule um evento existente à partida.' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {operacoes.map((op) => (
              <li key={op.id}>
                <Link
                  href={`/admin/eventos/${op.id}`}
                  className="block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.45)]"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-[rgb(var(--foreground))]">{op.titulo}</span>
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">
                      {TIPO_EVENTO_LABEL[op.tipo as keyof typeof TIPO_EVENTO_LABEL] ?? op.tipo}
                      {op.departamentoNome ? ` · ${op.departamentoNome}` : ''}
                    </span>
                    <span className="ml-auto text-xs text-[rgb(var(--foreground-muted))]">
                      {formatarDataHora(op.data)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[rgb(var(--foreground-muted))]">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {op.capacidade != null
                        ? `${op.confirmados}/${op.capacidade}`
                        : `${op.confirmados} confirmados`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                      {op.postos} posto{op.postos === 1 ? '' : 's'}
                    </span>
                    {op.materialEmCampo > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" aria-hidden />
                        {op.materialEmCampo} item(ns)
                      </span>
                    )}
                    {op.local && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {op.local}
                      </span>
                    )}
                  </div>

                  {op.alertaEscala && (
                    <p
                      className={
                        op.alertaEscala.severidade === 'alta'
                          ? 'mt-2 inline-flex items-center gap-1.5 text-xs text-[rgb(var(--color-danger-fg))]'
                          : 'mt-2 inline-flex items-center gap-1.5 text-xs text-[rgb(var(--color-warning-fg))]'
                      }
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {op.alertaEscala.texto}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {arquibancada?.linha && (
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Ticket className={ICONE_KPI} aria-hidden />
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Arquibancada</h2>
            <span className="text-sm text-[rgb(var(--foreground-muted))]">
              {arquibancada.linha}
              {arquibancada.portao ? ` · Portão ${arquibancada.portao}` : ''}
            </span>
          </div>
          <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
            Setor cadastrado na Sede. O acesso da organizada é em horário diferenciado do
            público geral — combine a chegada com a coordenação.
          </p>
        </section>
      )}
    </div>
  )
}
