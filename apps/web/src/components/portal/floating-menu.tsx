'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { m } from 'motion/react'
import { popoverPanel, springSnappy } from '@/lib/motion-presets'
import { AnchoredPopover, type AnchoredPlacement } from './anchored-popover'

/** Item de menu de ações no portal — caixa alta como `AdminRowActions`. */
export const FLOATING_MENU_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide hover:bg-[rgb(var(--background-subtle))]'

export const FLOATING_MENU_ITEM_DANGER =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-red-600 hover:bg-[rgb(var(--background-subtle))]'

/**
 * Menu dropdown em portal (`document.body`): escapa overflow de rails/cards e
 * fica acima do chrome sticky da Comunidade (z-20) sem perder pro navbar (z-40).
 * Sem `constrainHeight` — menus de ação são curtos; o teto+scroll do popover
 * gerava barra fantasma no Windows.
 */
export function FloatingMenu({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-end',
  minWidth,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  placement?: AnchoredPlacement
  minWidth?: number
  className?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose, anchorRef])

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      placement={placement}
      offset={4}
      minWidth={minWidth}
      zIndex={30}
      constrainHeight={false}
    >
      <m.div
        ref={panelRef}
        role="menu"
        variants={popoverPanel}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        className={
          className ??
          'card-soft overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg'
        }
      >
        {/* Um filho só: Motion mapeia children do `m.div` e exige key se forem vários. */}
        <div className="contents">{children}</div>
      </m.div>
    </AnchoredPopover>
  )
}
