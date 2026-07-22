import { db } from '@torcida/db'
import {
  PERIODO_LABEL,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'
import { carregarSerieNovosMembros } from '@/lib/admin-dashboard'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export async function MembrosSection({
  tenantId,
  periodo,
}: {
  tenantId: string
  periodo: Periodo
}) {
  const { inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

  const [serie, novosAnterior, pendentes, aprovados]: [SerieTemporal, number, number, number] =
    await Promise.all([
      carregarSerieNovosMembros(tenantId, periodo),
      db.saasMembro.count({
        where: { tenantId, criadoEm: { gte: inicioAnterior, lte: fimAnterior } },
      }),
      db.saasMembro.count({ where: { tenantId, status: 'PENDENTE' } }),
      db.saasMembro.count({ where: { tenantId, status: 'APROVADO' } }),
    ])

  const novosNoPeriodo = serie.reduce((acc, ponto) => acc + ponto.valor, 0)
  const vazio = novosNoPeriodo === 0 && novosAnterior === 0 && pendentes === 0 && aprovados === 0

  return (
    <InsightSection
      title="Membros"
      description={`Novos cadastros — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem cadastros ainda"
            description="Os indicadores aparecem quando a torcida receber os primeiros cadastros."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Novos no período"
            value={novosNoPeriodo}
            href="/admin/membros"
            delta={{ atual: novosNoPeriodo, anterior: novosAnterior }}
            sparkline={serie.map((ponto) => ponto.valor)}
          />
          <StatCard
            label="Aguardando aprovação"
            value={pendentes}
            tone={pendentes > 0 ? 'warning' : 'default'}
            href="/admin/membros"
          />
          <StatCard label="Membros aprovados" value={aprovados} href="/admin/membros" />
        </>
      )}
    </InsightSection>
  )
}
