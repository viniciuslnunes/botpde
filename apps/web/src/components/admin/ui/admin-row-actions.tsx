'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { AnchoredPopover } from '@/components/portal/anchored-popover'
import { useHidratado } from '@/lib/use-hidratado'

export type AdminRowActionTone = 'default' | 'success' | 'danger' | 'muted'

export interface AdminRowActionItem {
  id: string
  label: string
  icon?: LucideIcon
  tone?: AdminRowActionTone
  disabled?: boolean
  title?: string
  onSelect: () => void
}

export interface AdminRowActionsProps {
  /** Tooltip nativo do gatilho. Default: "Ações". */
  label?: string
  ariaLabel: string
  items: readonly AdminRowActionItem[]
  align?: 'start' | 'end'
  /** Alinha o gatilho à direita da célula (cards empilhados no mobile). */
  fullWidth?: boolean
}

const TOM: Record<AdminRowActionTone, string> = {
  default: 'text-[rgb(var(--foreground))]',
  muted: 'text-[rgb(var(--foreground-muted))]',
  success: 'text-success',
  danger: 'text-danger',
}

/** Mesmo 32×32 da paginação e do lápis em Acessos — `.app-touch-target` só cresce no toque. */
const GATILHO =
  'app-touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]'

const ITEM =
  'app-touch-target flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium uppercase tracking-wide hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Menu de ações da linha — gatilho só de ícone, painel no `body` para não ser
 * recortado pelo `overflow` da tabela. Substitui fileiras de botões nas listagens.
 */
export function AdminRowActions({
  label = 'Ações',
  ariaLabel,
  items,
  align = 'end',
  fullWidth = false,
}: AdminRowActionsProps) {
  const hidratado = useHidratado()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const menuId = useId()
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAberto(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto])

  if (items.length === 0) return null

  function escolher(item: AdminRowActionItem) {
    if (item.disabled) return
    setAberto(false)
    item.onSelect()
  }

  const menu: ReactNode = (
    <div
      id={menuId}
      role="menu"
      aria-label={ariaLabel}
      className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
    >
      {items.map((item) => {
        const Icon = item.icon
        const tom = TOM[item.tone ?? 'default']
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
            onClick={() => escolher(item)}
            className={[ITEM, tom].join(' ')}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {item.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={fullWidth ? 'flex w-full justify-end' : 'flex justify-end'}>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        onClick={() => setAberto((v) => !v)}
        className={[GATILHO, aberto ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]' : ''].join(
          ' ',
        )}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {hidratado && aberto
        ? createPortal(
            <div
              className="fixed inset-0"
              style={{ zIndex: 40 }}
              onClick={() => setAberto(false)}
              aria-hidden
            />,
            document.body,
          )
        : null}

      <AnchoredPopover
        open={aberto}
        anchorRef={triggerRef}
        placement={align === 'end' ? 'bottom-end' : 'bottom-start'}
        offset={6}
        minWidth={184}
        zIndex={41}
      >
        {menu}
      </AnchoredPopover>
    </div>
  )
}
