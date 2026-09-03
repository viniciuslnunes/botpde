'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { AnchoredPopover } from '@/components/portal/anchored-popover'
import { useHidratado } from '@/lib/use-hidratado'

export type DepartamentoOpcao = {
  id: string
  nome: string
}

const GATILHO_BASE =
  'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-left transition-colors hover:bg-[rgb(var(--background-subtle))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:cursor-not-allowed disabled:opacity-50'

const GATILHO_TAMANHO = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
} as const

const ITEM_MENU =
  'app-touch-target flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50'

/**
 * Select de opções longas (áreas, canais…) sem estourar o container —
 * menu ancorado com largura do gatilho e rótulos com line-clamp.
 */
export function DepartamentoOpcaoPicker({
  opcoes,
  value,
  onChange,
  placeholder = 'Selecionar…',
  name,
  disabled = false,
  size = 'sm',
  vazio,
  ariaLabel,
  menuAriaLabel = 'Opções',
  iconeItem,
  aberto: abertoControlado,
  onAbertoChange,
}: {
  opcoes: readonly DepartamentoOpcao[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** Campo oculto para submit em `<form>`. */
  name?: string
  disabled?: boolean
  size?: keyof typeof GATILHO_TAMANHO
  /** Opção “nenhum” (ex.: departamento inteiro, sem canal). */
  vazio?: DepartamentoOpcao
  ariaLabel?: string
  menuAriaLabel?: string
  iconeItem?: LucideIcon
  aberto?: boolean
  onAbertoChange?: (aberto: boolean) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [abertoInterno, setAbertoInterno] = useState(false)
  const aberto = abertoControlado ?? abertoInterno
  const setAberto = onAbertoChange ?? setAbertoInterno
  const menuId = useId()
  const hidratado = useHidratado()
  const IconeItem = iconeItem

  const todas = vazio ? [vazio, ...opcoes] : [...opcoes]
  const selecionada = todas.find((o) => o.id === value)
  const rotuloGatilho = selecionada?.nome ?? placeholder

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
  }, [aberto, setAberto])

  function escolher(id: string) {
    onChange(id)
    setAberto(false)
  }

  return (
    <div className="w-full min-w-0">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? rotuloGatilho}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        onClick={() => setAberto(!aberto)}
        className={[
          GATILHO_BASE,
          GATILHO_TAMANHO[size],
          aberto ? 'ring-2 ring-[rgb(var(--color-primary))]' : '',
          selecionada ? 'text-[rgb(var(--foreground))]' : 'text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
      >
        <span className="min-w-0 truncate">{rotuloGatilho}</span>
        <ChevronDown
          className={[
            'h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
            aberto ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
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
        placement="bottom-start"
        offset={4}
        matchAnchorWidth
        constrainHeight
        zIndex={41}
      >
        <div
          id={menuId}
          role="menu"
          aria-label={menuAriaLabel}
          className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
        >
          {todas.map((opcao) => (
            <OpcaoMenuItem
              key={opcao.id || '__vazio'}
              opcao={opcao}
              ativa={opcao.id === value}
              disabled={disabled}
              icone={IconeItem}
              onSelect={() => escolher(opcao.id)}
            />
          ))}
        </div>
      </AnchoredPopover>
    </div>
  )
}

function OpcaoMenuItem({
  opcao,
  ativa,
  disabled,
  icone: Icone,
  onSelect,
}: {
  opcao: DepartamentoOpcao
  ativa: boolean
  disabled: boolean
  icone?: LucideIcon
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={opcao.nome}
      onClick={onSelect}
      className={[
        ITEM_MENU,
        ativa ? 'bg-[rgb(var(--primary)_/_0.08)] font-medium text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground))]',
      ].join(' ')}
    >
      {Icone ? <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 flex-1 leading-snug line-clamp-3">{opcao.nome}</span>
    </button>
  )
}

export function DepartamentoOpcaoLista({
  itens,
  podeRemover,
  renderRemover,
}: {
  itens: readonly DepartamentoOpcao[]
  podeRemover?: boolean
  renderRemover?: (item: DepartamentoOpcao) => ReactNode
}) {
  if (itens.length === 0) return null
  return (
    <ul className="mb-1.5 flex w-full min-w-0 flex-col gap-1">
      {itens.map((item) => (
        <li
          key={item.id}
          className="flex min-w-0 items-center gap-1 rounded-lg bg-[rgb(var(--background-subtle))] px-2 py-1"
          title={item.nome}
        >
          <span className="min-w-0 flex-1 text-[10px] font-medium leading-snug text-[rgb(var(--foreground-muted))] line-clamp-2">
            {item.nome}
          </span>
          {podeRemover && renderRemover ? renderRemover(item) : null}
        </li>
      ))}
    </ul>
  )
}
