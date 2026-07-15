'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Minus,
} from 'lucide-react'
import { PERMISSION_GROUPS, applyPermissionCascade } from '@torcida/types'

export type PermissaoOrigem = 'via perfil' | 'extra' | 'revogada' | null

type PermissionGroup = (typeof PERMISSION_GROUPS)[number]

function groupState(
  group: PermissionGroup,
  selected: Set<string>,
): 'all' | 'some' | 'none' {
  const keys = group.items.map((i) => i.key)
  const on = keys.filter((k) => selected.has(k)).length
  if (on === 0) return 'none'
  if (on === keys.length) return 'all'
  return 'some'
}

function TriStateCheck({
  state,
  onClick,
  label,
}: {
  state: 'all' | 'some' | 'none'
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-checked={state === 'all' ? true : state === 'none' ? false : 'mixed'}
      role="checkbox"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={[
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        state === 'none'
          ? 'border-[rgb(var(--border-strong))] bg-transparent hover:border-[rgb(var(--primary))]'
          : 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]',
      ].join(' ')}
    >
      {state === 'all' && <Check className="h-2.5 w-2.5 text-white" aria-hidden />}
      {state === 'some' && <Minus className="h-2.5 w-2.5 text-white" aria-hidden />}
    </button>
  )
}

function LeafCheck({
  on,
  locked,
  onToggle,
}: {
  on: boolean
  locked?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-disabled={locked && on}
      disabled={locked && on}
      onClick={onToggle}
      className={[
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        locked && on ? 'cursor-not-allowed opacity-70' : '',
        on
          ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
          : 'border-[rgb(var(--border-strong))] hover:border-[rgb(var(--primary))]',
      ].join(' ')}
    >
      {on && <Check className="h-2.5 w-2.5 text-white" aria-hidden />}
    </button>
  )
}

function origemTone(origem: PermissaoOrigem): string {
  if (origem === 'extra') return 'text-[rgb(var(--primary))]'
  if (origem === 'revogada') return 'text-amber-600 dark:text-amber-400'
  return 'text-[rgb(var(--foreground-muted))]'
}

/**
 * Árvore de permissões (worktree): grupo → folhas, com conector em L
 * alinhado à Visão da torcida — sem cards aninhados por item.
 */
export function AccessPermissionWorktree({
  selected,
  onChange,
  origemOf,
  lockedKeys,
  initiallyOpen = true,
}: {
  selected: Set<string>
  /** Nova seleção efetiva (já com cascata aplicada). */
  onChange: (next: Set<string>) => void
  origemOf?: (key: string) => PermissaoOrigem
  /** Chaves que não podem ser desligadas (ex.: pacote do departamento). */
  lockedKeys?: Set<string>
  initiallyOpen?: boolean
}) {
  const [abertos, setAbertos] = useState<Set<string>>(
    () =>
      new Set(initiallyOpen ? PERMISSION_GROUPS.map((g) => g.label) : []),
  )
  const locked = lockedKeys ?? new Set<string>()

  const totais = useMemo(() => {
    let on = 0
    let all = 0
    for (const g of PERMISSION_GROUPS) {
      all += g.items.length
      on += g.items.filter((i) => selected.has(i.key)).length
    }
    return { on, all }
  }, [selected])

  function setOpen(label: string, open: boolean) {
    setAbertos((prev) => {
      const next = new Set(prev)
      if (open) next.add(label)
      else next.delete(label)
      return next
    })
  }

  function expandAll() {
    setAbertos(new Set(PERMISSION_GROUPS.map((g) => g.label)))
  }

  function collapseAll() {
    setAbertos(new Set())
  }

  function toggleLeaf(key: string) {
    if (locked.has(key) && selected.has(key)) return
    const prev = [...selected]
    const next = selected.has(key)
      ? prev.filter((p) => p !== key)
      : [...prev, key]
    onChange(new Set(applyPermissionCascade(prev, next)))
  }

  function toggleGroup(group: PermissionGroup) {
    const keys = group.items.map((i) => i.key as string)
    const editable = keys.filter((k) => !locked.has(k))
    if (editable.length === 0) return
    const state = groupState(group, selected)
    const prev = [...selected]
    const next =
      state === 'all'
        ? prev.filter((p) => !editable.includes(p))
        : [...new Set([...prev, ...editable])]
    for (const k of locked) {
      if (keys.includes(k)) next.push(k)
    }
    onChange(new Set(applyPermissionCascade(prev, [...new Set(next)])))
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
        <p className="text-[11px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
          {totais.on}/{totais.all} permissões ativas
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronsUpDown className="h-3 w-3" aria-hidden />
            Expandir
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronsDownUp className="h-3 w-3" aria-hidden />
            Recolher
          </button>
        </div>
      </div>

      <ul className="divide-y divide-[rgb(var(--border)_/_0.6)]" role="tree">
        {PERMISSION_GROUPS.map((group) => {
          const open = abertos.has(group.label)
          const state = groupState(group, selected)
          const marks = group.items.filter((i) => selected.has(i.key)).length

          return (
            <li key={group.label} role="treeitem" aria-expanded={open}>
              <div className="flex items-center gap-2 px-2.5 py-2 hover:bg-[rgb(var(--background-subtle)_/_0.55)]">
                <button
                  type="button"
                  aria-label={open ? `Recolher ${group.label}` : `Expandir ${group.label}`}
                  onClick={() => setOpen(group.label, !open)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
                >
                  <ChevronRight
                    className={[
                      'h-3.5 w-3.5 transition-transform duration-150 ease-out',
                      open ? 'rotate-90' : '',
                    ].join(' ')}
                    aria-hidden
                  />
                </button>
                <TriStateCheck
                  state={state}
                  label={
                    state === 'all'
                      ? `Desmarcar todas em ${group.label}`
                      : `Marcar todas em ${group.label}`
                  }
                  onClick={() => toggleGroup(group)}
                />
                <button
                  type="button"
                  onClick={() => setOpen(group.label, !open)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {group.label}
                  </span>
                </button>
                <span className="shrink-0 tabular-nums text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
                  {marks}/{group.items.length}
                </span>
              </div>

              {open && (
                <ul className="pb-1" role="group">
                  {group.items.map((item) => {
                    const on = selected.has(item.key)
                    const origem = origemOf?.(item.key) ?? null
                    const isBase = group.base === item.key

                    return (
                      <li key={item.key} role="treeitem">
                        <div
                          className={[
                            'flex items-center gap-2 py-1.5 pr-3 transition-colors',
                            on
                              ? 'bg-[rgb(var(--primary)_/_0.04)]'
                              : 'hover:bg-[rgb(var(--background-subtle)_/_0.4)]',
                          ].join(' ')}
                          style={{ paddingLeft: '1.75rem' }}
                        >
                          <span
                            aria-hidden
                            className="mr-0.5 inline-block h-3 w-3 shrink-0 border-b border-l border-[rgb(var(--border))]"
                          />
                          <LeafCheck
                            on={on}
                            locked={locked.has(item.key)}
                            onToggle={() => toggleLeaf(item.key)}
                          />
                          <button
                            type="button"
                            onClick={() => toggleLeaf(item.key)}
                            disabled={locked.has(item.key) && on}
                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                          >
                            <span
                              className={[
                                'block text-xs leading-snug',
                                on
                                  ? 'text-[rgb(var(--foreground))]'
                                  : 'text-[rgb(var(--foreground-muted))]',
                              ].join(' ')}
                            >
                              {item.label}
                              {isBase && (
                                <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide opacity-60">
                                  base
                                </span>
                              )}
                            </span>
                          </button>
                          {origem && (
                            <span
                              className={[
                                'shrink-0 text-[9px] font-semibold uppercase tracking-wide',
                                origemTone(origem),
                              ].join(' ')}
                            >
                              {origem}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
