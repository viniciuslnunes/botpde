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

/** Checkbox com contraste legível em claro e escuro. */
function TreeCheck({
  state,
  onClick,
  label,
  locked,
  accent = 'default',
}: {
  state: 'all' | 'some' | 'none'
  onClick: () => void
  label: string
  locked?: boolean
  /** `extra` = destaque para permissão adicional além do perfil. */
  accent?: 'default' | 'extra' | 'revogada'
}) {
  const on = state !== 'none'
  return (
    <button
      type="button"
      aria-label={label}
      aria-checked={state === 'all' ? true : state === 'none' ? false : 'mixed'}
      aria-disabled={locked}
      disabled={locked}
      role="checkbox"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={[
        'flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[0.3rem] border-2 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--primary))]',
        locked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
        !on &&
          'border-[rgb(var(--foreground)_/_0.35)] bg-[rgb(var(--background))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)_/_0.08)]',
        on && accent === 'extra'
          ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] shadow-[0_0_0_3px_rgb(var(--primary)_/_0.22)]'
          : '',
        on && accent === 'revogada'
          ? 'border-amber-500 bg-amber-500'
          : '',
        on && accent === 'default'
          ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {state === 'all' && <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />}
      {state === 'some' && <Minus className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />}
    </button>
  )
}

function origemBadgeClass(origem: PermissaoOrigem): string {
  if (origem === 'extra') {
    return 'bg-[rgb(var(--primary)_/_0.15)] text-[rgb(var(--primary))] ring-1 ring-[rgb(var(--primary)_/_0.35)]'
  }
  if (origem === 'revogada') {
    return 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300'
  }
  return 'bg-[rgb(var(--foreground)_/_0.06)] text-[rgb(var(--foreground-muted))]'
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
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
        <p className="text-[11px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
          {totais.on}/{totais.all} permissões ativas
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronsUpDown className="h-3 w-3" aria-hidden />
            Expandir
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronsDownUp className="h-3 w-3" aria-hidden />
            Recolher
          </button>
        </div>
      </div>

      <ul role="tree">
        {PERMISSION_GROUPS.map((group) => {
          const open = abertos.has(group.label)
          const state = groupState(group, selected)
          const marks = group.items.filter((i) => selected.has(i.key)).length

          return (
            <li
              key={group.label}
              role="treeitem"
              aria-expanded={open}
              className="border-b border-[rgb(var(--border)_/_0.7)] last:border-b-0"
            >
              <div
                className={[
                  'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
                  marks > 0
                    ? 'bg-[rgb(var(--surface))]'
                    : 'hover:bg-[rgb(var(--surface)_/_0.7)]',
                ].join(' ')}
              >
                <button
                  type="button"
                  aria-label={open ? `Recolher ${group.label}` : `Expandir ${group.label}`}
                  onClick={() => setOpen(group.label, !open)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <ChevronRight
                    className={[
                      'h-4 w-4 transition-transform duration-150 ease-out',
                      open ? 'rotate-90' : '',
                    ].join(' ')}
                    aria-hidden
                  />
                </button>
                <TreeCheck
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
                  <span className="text-sm font-semibold text-[rgb(var(--foreground))]">
                    {group.label}
                  </span>
                </button>
                <span
                  className={[
                    'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    marks > 0
                      ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {marks}/{group.items.length}
                </span>
              </div>

              {open && (
                <ul className="space-y-1 px-2 pb-2.5 pt-0.5" role="group">
                  {group.items.map((item) => {
                    const on = selected.has(item.key)
                    const origem = origemOf?.(item.key) ?? null
                    const isBase = group.base === item.key
                    const isLocked = locked.has(item.key)
                    const isExtra = origem === 'extra'
                    const isRevogada = origem === 'revogada'

                    return (
                      <li key={item.key} role="treeitem">
                        <div
                          className={[
                            'relative ml-7 flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2.5 transition-colors',
                            isExtra
                              ? 'bg-[rgb(var(--primary)_/_0.10)] ring-1 ring-inset ring-[rgb(var(--primary)_/_0.28)]'
                              : '',
                            isRevogada
                              ? 'bg-amber-500/8 ring-1 ring-inset ring-amber-500/25'
                              : '',
                            on && !isExtra && !isRevogada
                              ? 'bg-[rgb(var(--surface))]'
                              : '',
                            !on && !isExtra && !isRevogada
                              ? 'hover:bg-[rgb(var(--surface)_/_0.8)]'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span
                            aria-hidden
                            className="absolute -left-3 top-0 bottom-1/2 w-3 border-b-2 border-l-2 border-[rgb(var(--foreground)_/_0.18)]"
                          />
                          <TreeCheck
                            state={on ? 'all' : 'none'}
                            locked={isLocked && on}
                            accent={
                              isExtra ? 'extra' : isRevogada ? 'revogada' : 'default'
                            }
                            label={item.label}
                            onClick={() => toggleLeaf(item.key)}
                          />
                          <button
                            type="button"
                            onClick={() => toggleLeaf(item.key)}
                            disabled={isLocked && on}
                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                          >
                            <span
                              className={[
                                'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-snug',
                                on || isExtra
                                  ? 'font-medium text-[rgb(var(--foreground))]'
                                  : 'text-[rgb(var(--foreground-muted))]',
                                isRevogada ? 'line-through opacity-80' : '',
                              ].join(' ')}
                            >
                              {item.label}
                              {isBase && (
                                <span className="rounded bg-[rgb(var(--foreground)_/_0.08)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                                  base
                                </span>
                              )}
                            </span>
                          </button>
                          {origem && (
                            <span
                              className={[
                                'shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                origemBadgeClass(origem),
                              ].join(' ')}
                            >
                              {origem === 'extra' ? 'extra' : origem}
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
