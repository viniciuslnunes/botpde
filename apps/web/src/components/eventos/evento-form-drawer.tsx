'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isTopmostAppModal, lockBodyScroll } from '@/lib/app-modal'
import { useHidratado } from '@/lib/use-hidratado'

/** Painel lateral / sheet mobile para criar ou editar eventos. */
export function EventoFormDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
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
    panelRef.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
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
        className="relative z-10 flex max-h-[min(92dvh,100%)] w-full flex-col rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pb-[env(safe-area-inset-bottom)] shadow-xl sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:pb-0"
      >
        <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-[rgb(var(--foreground))]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
