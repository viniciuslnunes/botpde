import { MotionReveal } from '@/components/motion/motion-reveal'
import { DepartamentoFluxoCta } from './departamento-fluxo-cta'

type FluxoSugestaoPainel = {
  id: string
  titulo: string
  descricao: string
  href: string
  cta: string
  tom: 'urgente' | 'atencao' | 'rotina'
  ativavel: boolean
}

function classeTom(tom: FluxoSugestaoPainel['tom'], destaque: boolean): string {
  if (destaque) {
    if (tom === 'urgente') {
      return 'border-[rgb(var(--color-warning)_/_0.45)] bg-[rgb(var(--color-warning)_/_0.08)]'
    }
    return 'border-[rgb(var(--primary)_/_0.25)] bg-[rgb(var(--primary)_/_0.06)]'
  }
  return 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
}

export function DepartamentoProximaAcao({
  fluxos,
  isGestor,
  departamentoId,
  slug,
}: {
  fluxos: FluxoSugestaoPainel[]
  isGestor: boolean
  departamentoId: string
  slug: string
}) {
  if (fluxos.length === 0) return null

  const [principal, ...resto] = fluxos
  if (!principal) return null

  return (
    <section className="space-y-3" aria-label={isGestor ? 'Sugerido agora' : 'Sua vez'}>
      <MotionReveal>
        <div
          className={[
            'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3',
            classeTom(principal.tom, true),
          ].join(' ')}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[rgb(var(--color-primary-fg))]">
              {isGestor ? 'Sugerido agora' : 'Sua vez'}
            </p>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{principal.titulo}</p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">{principal.descricao}</p>
          </div>
          <DepartamentoFluxoCta
            fluxo={principal}
            departamentoId={departamentoId}
            slug={slug}
            isGestor={isGestor}
            destaque
          />
        </div>
      </MotionReveal>

      {resto.length > 0 ? (
        <ul className="space-y-2">
          {resto.map((fluxo, i) => (
            <li key={fluxo.id}>
              <MotionReveal index={i + 1}>
                <div
                  className={[
                    'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                    classeTom(fluxo.tom, false),
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--foreground))]">{fluxo.titulo}</p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">{fluxo.descricao}</p>
                  </div>
                  <DepartamentoFluxoCta
                    fluxo={fluxo}
                    departamentoId={departamentoId}
                    slug={slug}
                    isGestor={isGestor}
                    destaque={false}
                  />
                </div>
              </MotionReveal>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
