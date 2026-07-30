import type { ReactNode } from 'react'
import { MotionReveal } from '@/components/motion/motion-reveal'

export interface ConfigSectionCardProps {
  /** Ícone como JSX — função Lucide não serializa Server→Client. */
  icon: ReactNode
  title: string
  description: string
  /** Seção restrita ao owner da torcida (não é permissão do RBAC). */
  ownerOnly?: boolean
  /** True quando a seção é ownerOnly e o usuário atual não é owner. */
  blocked?: boolean
  /** Ordem de entrada na animação de revelação. */
  index?: number
  children: ReactNode
}

/**
 * Card de uma seção de configuração. Extraído do switch gigante que
 * `/admin/configuracoes` mantinha quando as sete seções eram tabs de query
 * param — agora cada rota do módulo empilha os seus próprios cards.
 */
export function ConfigSectionCard({
  icon,
  title,
  description,
  ownerOnly = false,
  blocked = false,
  index = 0,
  children,
}: ConfigSectionCardProps) {
  return (
    <MotionReveal index={index}>
      <section
        className={[
          'overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
          blocked ? 'opacity-60' : '',
        ].join(' ')}
      >
        <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))]">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[rgb(var(--foreground))]">{title}</h2>
              {ownerOnly && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  Somente owner
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          {blocked ? (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Apenas o owner da torcida pode alterar esta configuração.
            </p>
          ) : (
            children
          )}
        </div>
      </section>
    </MotionReveal>
  )
}
