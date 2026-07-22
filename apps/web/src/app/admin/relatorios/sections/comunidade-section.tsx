import {
  resumirEngajamento,
  resumirLeituraComunicados,
  type EngajamentoResumo,
  type LeituraComunicadosResumo,
} from '@/lib/comunidade-insights'
import { PERIODO_LABEL, type Periodo } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart, Sparkline } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export async function ComunidadeSection({
  tenantId,
  periodo,
}: {
  tenantId: string
  periodo: Periodo
}) {
  const [engajamento, leitura]: [EngajamentoResumo, LeituraComunicadosResumo] =
    await Promise.all([
      resumirEngajamento(tenantId, periodo),
      resumirLeituraComunicados(tenantId),
    ])

  const totalInteracoes =
    engajamento.atual.posts + engajamento.atual.reacoes + engajamento.atual.comentarios
  const totalAnterior =
    engajamento.anterior.posts + engajamento.anterior.reacoes + engajamento.anterior.comentarios
  const vazio = totalInteracoes === 0 && totalAnterior === 0 && leitura.comunicados.length === 0

  return (
    <InsightSection
      title="Comunidade"
      description={`Engajamento — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior · alcance dos comunicados.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem atividade na comunidade"
            description="Posts, reações, comentários e comunicados aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Posts no período"
            value={engajamento.atual.posts}
            delta={{ atual: engajamento.atual.posts, anterior: engajamento.anterior.posts }}
            href="/admin/comunidade/mural"
          />
          <StatCard
            label="Reações + comentários"
            value={engajamento.atual.reacoes + engajamento.atual.comentarios}
            delta={{
              atual: engajamento.atual.reacoes + engajamento.atual.comentarios,
              anterior: engajamento.anterior.reacoes + engajamento.anterior.comentarios,
            }}
          />
          <StatCard
            label="Denúncias abertas"
            value={engajamento.denunciasAbertas}
            tone={engajamento.denunciasAbertas > 0 ? 'warning' : 'default'}
            href="/admin/comunidade/moderacao"
          />

          {totalInteracoes > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Interações por dia
              </h3>
              <Sparkline
                data={engajamento.interacoesPorDia.map((p) => p.valor)}
                width={420}
                height={56}
                className="h-14 w-full"
              />
            </div>
          ) : null}

          {leitura.comunicados.length > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Leituras dos últimos comunicados
                {leitura.taxaMedia !== null
                  ? ` · média ${(leitura.taxaMedia * 100).toLocaleString('pt-BR', {
                      maximumFractionDigits: 0,
                    })}%`
                  : ''}
              </h3>
              <MiniBarChart
                data={leitura.comunicados.map((c) => ({ rotulo: c.titulo, valor: c.leituras }))}
              />
            </div>
          ) : null}
        </>
      )}
    </InsightSection>
  )
}
