import type { ReactNode } from 'react'
import { MotionReveal } from '@/components/motion/motion-reveal'

export interface DepartamentoSectionCardProps {
  /** Ícone como JSX — função Lucide não serializa Server→Client. */
  icon: ReactNode
  title: string
  description: string
  /** Cabeçalho da aba — o `?tab=` da barra já é o deep link. */
  id?: string
  /** Bloco em modo só-leitura para quem não pode gerir esta seção. */
  blocked?: boolean
  /** Motivo curto exibido junto ao badge quando `blocked`. */
  blockedReason?: string
  /** Ordem de entrada na animação de revelação. */
  index?: number
  actions?: ReactNode
  children: ReactNode
}

/**
 * Card de uma seção do cockpit de departamento. Porta o idioma de
 * `configuracoes/_components/config-section-card.tsx`: quem não pode gerir
 * uma seção continua vendo o conteúdo (esmaecido), com o motivo — descoberta
 * em vez de sumiço.
 */
export function DepartamentoSectionCard({
  icon,
  title,
  description,
  id,
  blocked = false,
  blockedReason,
  index = 0,
  actions,
  children,
}: DepartamentoSectionCardProps) {
  return (
    <MotionReveal index={index}>
      <section
        id={id}
        className={[
          'scroll-mt-20 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
          blocked ? 'opacity-60' : '',
        ].join(' ')}
      >
        <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))]">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-[rgb(var(--foreground))]">{title}</h2>
              {blocked && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  Só leitura
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
          </div>
          {actions && !blocked && <div className="shrink-0">{actions}</div>}
        </div>

        <div className="px-6 py-5">
          {blocked ? (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {blockedReason ?? 'Você só pode visualizar esta seção — a gestão é do departamento.'}
            </p>
          ) : (
            children
          )}
        </div>
      </section>
    </MotionReveal>
  )
}
