'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type Placement = 'top' | 'bottom'

/**
 * Recolhe o bloco de clube / torcida / afiliações na sidebar.
 * Aberto por padrão — os três campos continuam iguais; o chevron só esconde ou mostra.
 */
export function AdminContextDisclosure({
  title = 'Clube e torcida',
  defaultOpen = true,
  placement = 'top',
  children,
}: {
  title?: string
  defaultOpen?: boolean
  placement?: Placement
  children: ReactNode
}) {
  const panelId = useId()
  const [aberto, setAberto] = useState(defaultOpen)

  return (
    <div
      className={
        placement === 'bottom'
          ? 'border-t border-[rgb(var(--border))]'
          : 'border-b border-[rgb(var(--border))]'
      }
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={panelId}
        className="app-action flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--primary)_/_0.35)]"
      >
        <span className="min-w-0 flex-1 text-xs font-semibold text-[rgb(var(--foreground-muted))]">
          {title}
        </span>
        <ChevronDown
          className={[
            'h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform duration-200 motion-reduce:transition-none',
            aberto ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-label={title}
        className={[
          'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
          aberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        {/* overflow visível só aberto: o combobox dos switchers é absolute e
            overflow-hidden recortava a lista — não dava para escolher. */}
        <div
          className={aberto ? 'min-h-0 overflow-visible' : 'min-h-0 overflow-hidden'}
          inert={!aberto}
        >
          <div className="px-4 pb-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
