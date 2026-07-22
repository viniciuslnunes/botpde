import {
  listarPresencaPorEvento,
  resumirComparecimento,
  type EventoPresencaItem,
  type EventosComparecimentoResumo,
} from '@/lib/eventos-insights'
import { PERIODO_LABEL, type Periodo } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

function formatarPct(valor: number | null): string {
  return valor == null ? '—' : `${Math.round(valor * 100)}%`
}

export async function EventosSection({
  tenantId,
  periodo,
}: {
  tenantId: string
  periodo: Periodo
}) {
  const [resumo, presencaPorEvento]: [EventosComparecimentoResumo, EventoPresencaItem[]] =
    await Promise.all([
      resumirComparecimento(tenantId, periodo),
      listarPresencaPorEvento(tenantId, 8),
    ])

  return (
    <InsightSection
      title="Eventos"
      description={`Comparecimento (RSVP × check-in) — ${PERIODO_LABEL[periodo].toLowerCase()}.`}
    >
      {resumo.eventosPassados === 0 ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem eventos no período"
            description="Os indicadores de presença aparecem depois que os eventos acontecem."
          />
        </div>
      ) : (
        <>
          <StatCard
            label={`Taxa de presença (${resumo.presentes}/${resumo.confirmados})`}
            value={formatarPct(resumo.taxaPresenca)}
            tone={
              resumo.taxaPresenca != null && resumo.taxaPresenca >= 0.7 ? 'success' : 'default'
            }
          />
          <StatCard
            label="No-show"
            value={resumo.noShow}
            tone={resumo.noShow > 0 ? 'warning' : 'default'}
          />
          <StatCard label="Ocupação média" value={formatarPct(resumo.ocupacaoMedia)} />

          <StatCard
            compact
            label="Eventos realizados"
            value={resumo.eventosPassados}
            href="/admin/eventos"
          />
          <StatCard compact label="Check-ins" value={resumo.presentes} tone="success" />
          <StatCard
            compact
            label="Lista de espera"
            value={resumo.listaEspera}
            tone={resumo.listaEspera > 0 ? 'warning' : 'default'}
          />

          {presencaPorEvento.length > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Confirmados × presentes (últimos eventos)
              </h3>
              <MiniBarChart
                data={presencaPorEvento.map((e) => ({
                  rotulo: e.rotulo,
                  valor: e.confirmados,
                  valorSecundario: e.presentes,
                  cor: 'rgb(var(--color-primary) / 0.75)',
                }))}
                corSecundaria="rgb(var(--color-success) / 0.75)"
                legenda={{ principal: 'Confirmados', secundaria: 'Presentes' }}
              />
            </div>
          ) : null}
        </>
      )}
    </InsightSection>
  )
}
