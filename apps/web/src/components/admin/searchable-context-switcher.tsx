'use client'

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { flushSync, useFormStatus } from 'react-dom'
import { Clock, Loader2, Search } from 'lucide-react'
import { HoverTip, hoverTipFromElement, type HoverTipAnchor } from '@/components/ui/hover-tip'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { lerRecentes, registrarRecente } from '@/lib/context-switcher-recentes'
import { useHidratado } from '@/lib/use-hidratado'

const MAX_SUGESTOES = 40

function SubmitSpinner({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus()
  const busy = pending || formPending
  if (!busy) return null
  return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden />
}

export type ContextSwitcherItem = {
  id: string
  /** Chave usada em recentes (default = id). */
  recentKey?: string
}

type Props<T extends ContextSwitcherItem> = {
  label: string
  placeholder: string
  emptyMessage: string
  items: T[]
  valueId: string | null
  getLabel: (item: T) => string
  getSubLabel?: (item: T) => string | null
  getSearchText?: (item: T) => string
  /** Padding-left extra por item (ex.: depth da worktree). */
  getIndentRem?: (item: T) => number
  recentNamespace: string
  variant?: 'admin' | 'super-admin'
  disabled?: boolean
  pending?: boolean
  footer?: ReactNode
  formAction?: (formData: FormData) => void | Promise<void>
  hiddenFields?: Record<string, string>
  /** Campos extras derivados do item (ex.: modo/sedeId da unidade). */
  getFormFields?: (item: T) => Record<string, string>
  /** Nome do hidden que recebe o id selecionado (default: `id`). Null = não emitir. */
  valueFieldName?: string | null
  onSelect?: (item: T) => void
  /** Se retorna false, atualiza UI/recentes mas não submete o form. */
  shouldSubmitOnSelect?: (item: T) => boolean
  /** Se false, não submete o form após selecionar (só filtro local). */
  submitOnSelect?: boolean
}

export function SearchableContextSwitcher<T extends ContextSwitcherItem>({
  label,
  placeholder,
  emptyMessage,
  items,
  valueId,
  getLabel,
  getSubLabel,
  getSearchText,
  getIndentRem,
  recentNamespace,
  variant = 'admin',
  disabled = false,
  pending = false,
  footer,
  formAction,
  hiddenFields,
  getFormFields,
  valueFieldName = 'id',
  onSelect,
  shouldSubmitOnSelect,
  submitOnSelect = true,
}: Props<T>) {
  const listId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const atual = useMemo(
    () => items.find((t) => t.id === valueId) ?? null,
    [items, valueId],
  )
  // Inclui o rótulo: se o `valueId` continua igual mas o item some da lista
  // filtrada (ex.: mudou o clube-pai), o input precisa limpar — não só
  // reagindo a troca de id.
  const atualLabel = atual ? getLabel(atual) : ''
  const syncKey = `${valueId ?? ''}\0${atualLabel}`

  const [query, setQuery] = useState(() => atualLabel)
  const [selectedId, setSelectedId] = useState(valueId ?? '')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const [recentesIds, setRecentesIds] = useState<string[]>([])
  const [dynamicFields, setDynamicFields] = useState<Record<string, string>>(() =>
    atual && getFormFields ? getFormFields(atual) : {},
  )
  const [tip, setTip] = useState<HoverTipAnchor | null>(null)

  function limparTip() {
    setTip(null)
  }

  function mostrarTip(text: string, el: HTMLElement) {
    setTip(hoverTipFromElement(text, el))
  }

  const [prevSyncKey, setPrevSyncKey] = useState(syncKey)
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey)
    setSelectedId(atual ? atual.id : '')
    setQuery(atualLabel)
    setDynamicFields(atual && getFormFields ? getFormFields(atual) : {})
    setAberto(false)
  }

  // Os recentes vivem no storage do cliente: carrega no primeiro render
  // pós-hidratação (e ao trocar de namespace), em vez de um effect que
  // reordenava a lista um frame depois de ela aparecer.
  const hidratado = useHidratado()
  const [namespaceCarregado, setNamespaceCarregado] = useState<string | null>(null)
  if (hidratado && namespaceCarregado !== recentNamespace) {
    setNamespaceCarregado(recentNamespace)
    setRecentesIds(lerRecentes(recentNamespace))
  }

  const porId = useMemo(() => {
    const map = new Map<string, T>()
    for (const t of items) map.set(t.id, t)
    return map
  }, [items])

  const porRecentKey = useMemo(() => {
    const map = new Map<string, T>()
    for (const t of items) map.set(t.recentKey ?? t.id, t)
    return map
  }, [items])

  const selecionada = porId.get(selectedId) ?? null
  const labelSelecionada = selecionada ? getLabel(selecionada) : ''

  const alvoBusca = useMemo(() => {
    const n = normalizarTexto(query)
    if (!n) return ''
    if (n === normalizarTexto(labelSelecionada)) return ''
    return n
  }, [query, labelSelecionada])

  const { recentes, demais, truncado } = useMemo(() => {
    function coincide(item: T, alvo: string): boolean {
      if (!alvo) return true
      const hay = getSearchText
        ? getSearchText(item)
        : [getLabel(item), getSubLabel?.(item) ?? ''].join(' ')
      return normalizarTexto(hay).includes(alvo)
    }

    const recenteSet = new Set(recentesIds)
    const recentesLista: T[] = []
    for (const key of recentesIds) {
      const t = porRecentKey.get(key)
      if (t && coincide(t, alvoBusca)) recentesLista.push(t)
    }

    const demaisLista = items.filter((t) => {
      const key = t.recentKey ?? t.id
      return !recenteSet.has(key) && coincide(t, alvoBusca)
    })

    const total = recentesLista.length + demaisLista.length
    const recentesVisiveis = recentesLista.slice(0, MAX_SUGESTOES)
    const demaisVisiveis = demaisLista.slice(
      0,
      Math.max(MAX_SUGESTOES - recentesVisiveis.length, 0),
    )

    return {
      recentes: recentesVisiveis,
      demais: demaisVisiveis,
      truncado: total > MAX_SUGESTOES,
    }
  }, [items, porRecentKey, recentesIds, alvoBusca, getLabel, getSubLabel, getSearchText])

  const sugestoes = useMemo(() => [...recentes, ...demais], [recentes, demais])

  // Volta o destaque ao topo quando a lista muda (mesmo ajuste em render que
  // o bloco de `syncKey` acima já usa).
  const [destaqueKey, setDestaqueKey] = useState(`${alvoBusca}|${aberto}`)
  if (destaqueKey !== `${alvoBusca}|${aberto}`) {
    setDestaqueKey(`${alvoBusca}|${aberto}`)
    setDestaque(0)
  }

  function selecionar(item: T) {
    const key = item.recentKey ?? item.id
    registrarRecente(recentNamespace, key)
    setRecentesIds(lerRecentes(recentNamespace))
    flushSync(() => {
      setSelectedId(item.id)
      setQuery(getLabel(item))
      setAberto(false)
      if (getFormFields) setDynamicFields(getFormFields(item))
    })
    onSelect?.(item)
    const form = formRef.current
    const podeSubmeter =
      submitOnSelect &&
      formAction &&
      form &&
      (shouldSubmitOnSelect ? shouldSubmitOnSelect(item) : true)
    if (podeSubmeter && form) {
      form.requestSubmit()
    }
  }

  const allHiddenFields = { ...(hiddenFields ?? {}), ...dynamicFields }

  const isSuper = variant === 'super-admin'
  const labelClass = isSuper
    ? 'text-xs font-medium text-zinc-500'
    : 'text-xs font-medium text-[rgb(var(--foreground-muted))]'
  const inputClass = isSuper
    ? 'w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-60'
    : 'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary))] disabled:opacity-60'
  const listClass = isSuper
    ? 'absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg'
    : 'absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg'
  const itemIdle = isSuper
    ? 'text-zinc-200 hover:bg-zinc-800'
    : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]'
  const itemActive = isSuper
    ? 'bg-violet-950/60 text-violet-200'
    : 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
  const mutedClass = isSuper ? 'text-zinc-500' : 'text-[rgb(var(--foreground-muted))]'
  const sectionClass = isSuper
    ? 'flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500'
    : 'flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]'
  const iconClass = isSuper
    ? 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500'
    : 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]'

  function renderItem(item: T, i: number) {
    const ativa = item.id === selectedId
    const destaqueItem = i === destaque
    const rótulo = getLabel(item)
    const subtítulo = getSubLabel?.(item) ?? null
    const indent = getIndentRem?.(item) ?? 0
    return (
      <li key={item.id} role="option" aria-selected={ativa} id={`${listId}-opt-${item.id}`}>
        <button
          type="button"
          disabled={disabled || pending}
          onPointerEnter={(e) => {
            setDestaque(i)
            mostrarTip(rótulo, e.currentTarget)
          }}
          onPointerLeave={limparTip}
          onMouseDown={(e) => {
            e.preventDefault()
            limparTip()
            selecionar(item)
          }}
          className={`flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
            destaqueItem || ativa ? itemActive : itemIdle
          }`}
          style={indent > 0 ? { paddingLeft: `${0.75 + indent * 0.75}rem` } : undefined}
        >
          <span data-switcher-label className="min-w-0 truncate font-medium">
            {rótulo}
          </span>
          {subtítulo ? (
            <span className={`truncate text-xs ${mutedClass}`}>{subtítulo}</span>
          ) : null}
        </button>
      </li>
    )
  }

  const fields = (
    <>
      {formAction
        ? Object.entries(allHiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      {formAction && valueFieldName ? (
        <input type="hidden" name={valueFieldName} value={selectedId} />
      ) : null}
      <label className={labelClass} htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className={iconClass} aria-hidden />
          <input
            id={`${listId}-input`}
            type="text"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              aberto && sugestoes[destaque]
                ? `${listId}-opt-${sugestoes[destaque].id}`
                : undefined
            }
            value={query}
            disabled={disabled || pending}
            autoComplete="off"
            placeholder={placeholder}
            className={inputClass}
            onPointerEnter={(e) => {
              if (!query.trim()) {
                limparTip()
                return
              }
              mostrarTip(query, e.currentTarget)
            }}
            onPointerLeave={limparTip}
            onChange={(e) => {
              setQuery(e.target.value)
              setAberto(true)
              limparTip()
            }}
            onFocus={(e) => {
              setAberto(true)
              limparTip()
              e.target.select()
            }}
            onBlur={() => {
              setAberto(false)
              limparTip()
              const sel = porId.get(selectedId)
              setQuery(sel ? getLabel(sel) : '')
            }}
            onKeyDown={(e) => {
              if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                setAberto(true)
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setDestaque((i) => Math.min(i + 1, Math.max(sugestoes.length - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setDestaque((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && aberto && sugestoes[destaque]) {
                e.preventDefault()
                limparTip()
                selecionar(sugestoes[destaque])
              } else if (e.key === 'Escape') {
                setAberto(false)
                limparTip()
              }
            }}
          />
          {aberto && !disabled && (
            <ul
              id={listId}
              role="listbox"
              className={listClass}
              onScroll={limparTip}
            >
              {sugestoes.length === 0 ? (
                <li className={`px-3 py-2 text-sm ${mutedClass}`}>{emptyMessage}</li>
              ) : (
                <>
                  {recentes.length > 0 && !alvoBusca && (
                    <li role="presentation" className={sectionClass}>
                      <Clock className="h-3 w-3" aria-hidden />
                      Recentes
                    </li>
                  )}
                  {recentes.map((t, i) => renderItem(t, i))}
                  {recentes.length > 0 && demais.length > 0 && !alvoBusca && (
                    <li role="presentation" className={sectionClass}>
                      Todas
                    </li>
                  )}
                  {demais.map((t, i) => renderItem(t, recentes.length + i))}
                </>
              )}
              {truncado && (
                <li className={`px-3 py-1.5 text-[11px] ${mutedClass}`}>
                  Digite mais para refinar a busca…
                </li>
              )}
            </ul>
          )}
          <HoverTip tip={tip} variant={variant === 'super-admin' ? 'super-admin' : 'default'} />
        </div>
        {formAction ? <SubmitSpinner pending={pending} /> : null}
      </div>
      {footer}
    </>
  )

  if (!formAction) {
    return <div className="space-y-1">{fields}</div>
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-1">
      {fields}
    </form>
  )
}
