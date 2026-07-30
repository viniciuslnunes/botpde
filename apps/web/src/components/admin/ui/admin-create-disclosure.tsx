'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'

export interface AdminCreateDisclosureProps {
  /** Rótulo do botão fechado (ex.: "Nova cobrança"). */
  label: string
  /** Título do painel aberto — default: `label`. */
  title?: string
  /** Formulário de criação, renderizado no servidor e revelado ao abrir. */
  children: ReactNode
}

/**
 * Ação de criar que fica recolhida como botão em vez de empilhar o formulário
 * no meio da página — mesmo padrão de `CriarProdutoForm`, para hubs cujo
 * formulário é um componente compartilhado (edição reusa o mesmo form).
 */
export function AdminCreateDisclosure({ label, title, children }: AdminCreateDisclosureProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      {!open ? (
        <m.button
          type="button"
          onClick={() => setOpen(true)}
          whileTap={{ scale: 0.97 }}
          transition={springSnappy}
          className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {label}
        </m.button>
      ) : null}

      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 pb-2">
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {title ?? label}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={`Fechar ${title ?? label}`}
                className="rounded-lg p-1 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
