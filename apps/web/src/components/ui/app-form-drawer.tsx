'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isTopmostAppModal, lockBodyScroll } from '@/lib/app-modal'
import { useHidratado } from '@/lib/use-hidratado'

const WIDTH_CLASS = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
} as const

/**
 * Drawer à direita no desktop; sheet na base no telefone.
 * Porta no `body` e entra na pilha de `app-modal-backdrop` (Escape, scroll).
 */
export function AppFormDrawer({
  open,
  onClose,
  title,
  width = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  width?: keyof typeof WIDTH_CLASS
  children: ReactNode
}) {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hidratado = useHidratado()

  useEffect(() => {
    if (!open) return
    const unlock = lockBodyScroll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const overlay = overlayRef.current
      if (!overlay || !isTopmostAppModal(overlay)) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current
      ?.querySelector<HTMLElement>(
        '[data-drawer-body] input, [data-drawer-body] select, [data-drawer-body] textarea',
      )
      ?.focus()
    return () => {
      unlock()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!hidratado || !open) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="app-modal-backdrop fixed inset-0 flex items-end justify-end bg-black/70 backdrop-blur-[2px] sm:items-stretch"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-transparent"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'relative z-10 flex max-h-[min(92dvh,100%)] w-full flex-col rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pb-[env(safe-area-inset-bottom)] shadow-xl sm:max-h-none sm:w-full sm:rounded-none sm:border-l sm:pb-0',
          WIDTH_CLASS[width],
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-[rgb(var(--foreground))]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="app-touch-target rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div data-drawer-body className="app-scrollbar-fina min-h-0 flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
