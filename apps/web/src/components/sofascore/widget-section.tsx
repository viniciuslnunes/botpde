import { getWidgetsForContexto } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { SofascoreWidgetFrame } from './sofascore-widget-frame'
import type { SofascoreWidgetContexto, SofascoreWidgetTipo } from '@/lib/sofascore'

interface WidgetSectionProps {
  contexto: SofascoreWidgetContexto
  afiliacaoSlug: string | null | undefined
  competicaoSlug?: string | null
  jogadorId?: string | null
  limit?: number
  titulo?: string
  /** Repassado ao iframe — `eager` na página Classificação. */
  loading?: 'lazy' | 'eager'
  /** Omite o título interno do card quando a página já tem header. */
  hideTitulo?: boolean
}

/**
 * Seção de widgets oficiais Sofascore do clube do torcedor.
 * Sem widget cadastrado/ativo para o `afiliacaoSlug` → não renderiza nada
 * (nem placeholder, nem widget genérico).
 */
export async function WidgetSection({
  contexto,
  afiliacaoSlug,
  competicaoSlug,
  jogadorId,
  limit,
  titulo,
  loading,
  hideTitulo,
}: WidgetSectionProps) {
  const widgets = getWidgetsForContexto({ contexto, afiliacaoSlug, competicaoSlug, jogadorId, limit })
  if (widgets.length === 0) return null

  return (
    <section className="space-y-3">
      {titulo && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          {titulo}
        </h2>
      )}
      {widgets.map((w, i) => (
        <MotionReveal key={w.id} index={i}>
          <SofascoreWidgetFrame
            tipo={w.tipo as SofascoreWidgetTipo}
            titulo={w.titulo}
            embedSrc={w.embedSrc}
            alturaPx={w.alturaPx}
            creditoUrl={w.creditoUrl}
            creditoTexto={w.creditoTexto}
            loading={loading}
            hideTitulo={hideTitulo}
          />
        </MotionReveal>
      ))}
    </section>
  )
}
