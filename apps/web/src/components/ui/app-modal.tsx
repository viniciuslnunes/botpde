'use client'

import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  APP_MODAL_BACKDROP_CLASS,
  APP_MODAL_HEIGHT_CLASS,
  APP_MODAL_PANEL_CLASS,
  APP_MODAL_SIZE_CLASS,
  isTopmostAppModal,
  lockBodyScroll,
  type AppModalHeight,
  type AppModalLayer,
  type AppModalSize,
} from '@/lib/app-modal'
import { useHidratado } from '@/lib/use-hidratado'

export type { AppModalHeight, AppModalLayer, AppModalSize }

type AppModalProps = {
  open: boolean
  onClose: () => void
  /** `sm` confirmação · `md` formulário curto · `lg` cadastro · `xl` ficha. */
  size?: AppModalSize
  /** `frame` trava a altura (ficha com abas). Default `auto` encolhe no conteúdo. */
  height?: AppModalHeight
  /** `nested` cobre outro AppModal (crop, reprovar sobre o card). */
  layer?: AppModalLayer
  labelledBy?: string
  describedBy?: string
  /** Impede fechar por Escape / backdrop (envio em curso). */
  busy?: boolean
  className?: string
  children: ReactNode
}

/**
 * Overlay de modal portado em `document.body` — escapa o `overflow`/`z-index`
 * do shell admin (sidebar em z-60) para ser o único foco na tela.
 */
export function AppModal({
  open,
  onClose,
  size = 'md',
  height = 'auto',
  layer = 'base',
  labelledBy,
  describedBy,
  busy = false,
  className,
  children,
}: AppModalProps) {
  const hidratado = useHidratado()
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const unlock = lockBodyScroll()
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || busy) return
      const overlay = overlayRef.current
      if (!overlay || !isTopmostAppModal(overlay)) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unlock()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onClose])

  if (!hidratado || !open) return null

  function onBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || busy) return
    onClose()
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={APP_MODAL_BACKDROP_CLASS}
      data-layer={layer}
      role="presentation"
      onClick={onBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-busy={busy || undefined}
        className={[
          APP_MODAL_PANEL_CLASS,
          APP_MODAL_SIZE_CLASS[size],
          APP_MODAL_HEIGHT_CLASS[height],
          className ?? '',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Corpo rolável — cabeçalho e rodapé do modal ficam fora, `shrink-0`. */
export function AppModalBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={['min-h-0 flex-1 overflow-y-auto', className ?? ''].join(' ')}>
      {children}
    </div>
  )
}
