'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Image from 'next/image'
import { flushSync, useFormStatus } from 'react-dom'
import { Clock, Loader2 } from 'lucide-react'
import { HoverTip, hoverTipFromElement, type HoverTipAnchor } from '@/components/ui/hover-tip'
import { SearchFilterInput } from '@/components/ui/reactive-search'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { useEscudoCircular } from '@/lib/use-escudo-circular'
import { lerRecentes, registrarRecente } from '@/lib/context-switcher-recentes'
import { useHidratado } from '@/lib/use-hidratado'
import { useLatestRef } from '@/lib/use-latest-ref'

const MAX_SUGESTOES = 40

/** Espera antes de mandar o termo ao servidor. Abrir/trocar de pai não espera. */
const DEBOUNCE_BUSCA_MS = 220

function SubmitSpinner({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus()
  const busy = pending || formPending
  if (!busy) return null
  return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden />
}

function ContextSwitcherThumb({
  logoUrl,
  alt,
  variant,
  size = 'sm',
}: {
  logoUrl: string | null | undefined
  alt: string
  variant: 'admin' | 'super-admin'
  size?: 'sm' | 'md'
}) {
  const [imagemFalhou, setImagemFalhou] = useState(false)
  const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const px = size === 'sm' ? 20 : 24
  const src = logoUrl && !imagemFalhou ? logoUrl : null
  const { circular, pronto } = useEscudoCircular(src)
  const imgClass = [
    box,
    'shrink-0 object-contain',
    pronto && circular ? 'rounded-full overflow-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (src) {
    if (canOptimizeImageUrl(src)) {
      return (
        <Image
          key={src}
          src={src}
          alt=""
          width={px}
          height={px}
          className={imgClass}
          onError={() => setImagemFalhou(true)}
        />
      )
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={imgClass}
        onError={() => setImagemFalhou(true)}
      />
    )
  }

  const fallbackClass =
    variant === 'super-admin'
      ? 'border-zinc-600 bg-zinc-800 text-zinc-400'
      : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'

  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${fallbackClass}`}
    >
      {(alt.charAt(0) || '?').toUpperCase()}
    </span>
  )
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
  /** Escudo/logo à esquerda do rótulo (input fechado e opções da lista). */
  getLogoUrl?: (item: T) => string | null
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
  /**
   * Busca sob demanda. Quando presente, `items` deixa de ser o universo e passa
   * a ser só a **semente** (topo da lista + o item selecionado, que precisa
   * estar lá para o input exibir o próprio rótulo); o resto chega por
   * `buscar` conforme o operador digita.
   *
   * Existe porque a lista inteira viajava no payload RSC de toda navegação —
   * 147 KB de torcidas para um dropdown que mostra 40. O filtro local continua
   * rodando por cima do que já chegou, então o que está em mãos responde na
   * hora e o servidor só amplia.
   */
  buscaRemota?: {
    /** Recebe o termo cru (não normalizado) e os recentes a resolver junto. */
    buscar: (termo: string, recentes: string[]) => Promise<T[]>
    /** Redispara a busca quando um filtro-pai muda (ex.: clube da cascata). */
    chaveExtra?: string
  }
}

export function SearchableContextSwitcher<T extends ContextSwitcherItem>({
  label,
  placeholder,
  emptyMessage,
  items,
  valueId,
  getLabel,
  getSubLabel,
  getLogoUrl,
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
  buscaRemota,
}: Props<T>) {
  const listId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  // Resolvido na SEMENTE de propósito: com busca remota o universo muda a cada
  // digitação, e o rótulo do item ativo não pode piscar por causa disso.
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
  /**
   * Par (chave, itens) da última busca concluída — nunca zerado dentro do
   * effect, como manda `docs/frontend/react-compiler.md` § busca com debounce.
   * `chave: null` = nada buscado ainda (≠ buscado e veio vazio).
   */
  const [pool, setPool] = useState<{ chave: string | null; itens: T[] }>({
    chave: null,
    itens: [],
  })

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

  /**
   * Semente + o que a busca remota já trouxe. Sem `buscaRemota` é a própria
   * lista, e todo o resto do componente segue idêntico ao que era.
   */
  const universo = useMemo(() => {
    if (!buscaRemota || pool.itens.length === 0) return items
    const map = new Map<string, T>()
    for (const t of items) map.set(t.id, t)
    for (const t of pool.itens) if (!map.has(t.id)) map.set(t.id, t)
    return [...map.values()]
  }, [items, pool.itens, buscaRemota])

  const porId = useMemo(() => {
    const map = new Map<string, T>()
    for (const t of universo) map.set(t.id, t)
    return map
  }, [universo])

  const porRecentKey = useMemo(() => {
    const map = new Map<string, T>()
    for (const t of universo) map.set(t.recentKey ?? t.id, t)
    return map
  }, [universo])

  const selecionada = porId.get(selectedId) ?? null
  const labelSelecionada = selecionada ? getLabel(selecionada) : ''

  // Sem `useMemo`: `labelSelecionada` sai de um `Map` que o React Compiler não
  // consegue provar imutável, então o memo manual fazia ele **desistir de
  // otimizar o componente inteiro** (`preserve-manual-memoization`, que aqui é
  // erro). Duas normalizações de string não pagam esse preço — e o compilador
  // memoiza isto sozinho.
  const alvoBusca = (() => {
    const n = normalizarTexto(query)
    if (!n) return ''
    if (n === normalizarTexto(labelSelecionada)) return ''
    return n
  })()

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

    const demaisLista = universo.filter((t) => {
      const key = t.recentKey ?? t.id
      return !recenteSet.has(key) && coincide(t, alvoBusca)
    })

    // Com busca remota o servidor já cortou em `MAX_SUGESTOES`: nesse caso há
    // mais resultados lá fora mesmo que o filtro local não tenha cortado nada.
    const totalRemoto = pool.itens.length
    const total = recentesLista.length + demaisLista.length
    const recentesVisiveis = recentesLista.slice(0, MAX_SUGESTOES)
    const demaisVisiveis = demaisLista.slice(
      0,
      Math.max(MAX_SUGESTOES - recentesVisiveis.length, 0),
    )

    return {
      recentes: recentesVisiveis,
      demais: demaisVisiveis,
      truncado: total > MAX_SUGESTOES || totalRemoto >= MAX_SUGESTOES,
    }
  }, [
    universo,
    porRecentKey,
    recentesIds,
    alvoBusca,
    pool.itens.length,
    getLabel,
    getSubLabel,
    getSearchText,
  ])

  const sugestoes = useMemo(() => [...recentes, ...demais], [recentes, demais])

  // `alvoBusca` é normalizado (sem acento) e serve ao filtro local; o servidor
  // faz `contains` no texto cru, então recebe o que foi digitado de fato —
  // "sao" normalizado nunca casaria com "SÃO" num ILIKE.
  const termoRemoto = alvoBusca ? query.trim() : ''
  const chaveExtra = buscaRemota?.chaveExtra ?? ''
  // Busca ao abrir (para trazer os recentes e o topo) e sempre que o
  // filtro-pai muda, mesmo fechado — assim escolher um clube já deixa as
  // torcidas dele prontas quando o operador abrir o campo seguinte.
  const chaveDesejada =
    buscaRemota && (aberto || chaveExtra !== '')
      ? `${chaveExtra}\0${termoRemoto}`
      : null
  const buscandoRemoto = chaveDesejada !== null && pool.chave !== chaveDesejada

  const buscarRef = useLatestRef(buscaRemota?.buscar)
  const recentesRef = useLatestRef(recentesIds)

  useEffect(() => {
    if (chaveDesejada === null) return
    if (pool.chave === chaveDesejada) return
    let cancelado = false
    const timer = window.setTimeout(
      () => {
        void (async () => {
          const buscar = buscarRef.current
          if (!buscar) return
          try {
            const itens = await buscar(termoRemoto, recentesRef.current)
            // Grava só depois do await, inclusive em falha: sem isso o
            // "buscando" derivado nunca desligaria.
            if (!cancelado) setPool({ chave: chaveDesejada, itens })
          } catch {
            if (!cancelado) setPool({ chave: chaveDesejada, itens: [] })
          }
        })()
      },
      termoRemoto ? DEBOUNCE_BUSCA_MS : 0,
    )
    return () => {
      cancelado = true
      window.clearTimeout(timer)
    }
  }, [chaveDesejada, pool.chave, termoRemoto, buscarRef, recentesRef])

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
    ? 'app-scrollbar-fina app-scrollbar-sobre-escuro absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg'
    : 'app-scrollbar-fina absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg'
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

  const mostrarEscudoNoInput = Boolean(getLogoUrl && selecionada && !alvoBusca)

  function renderItem(item: T, i: number) {
    const ativa = item.id === selectedId
    const destaqueItem = i === destaque
    const rótulo = getLabel(item)
    const subtítulo = getSubLabel?.(item) ?? null
    const indent = getIndentRem?.(item) ?? 0
    const logoUrl = getLogoUrl?.(item) ?? null
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
          className={`flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            destaqueItem || ativa ? itemActive : itemIdle
          }`}
          style={indent > 0 ? { paddingLeft: `${0.75 + indent * 0.75}rem` } : undefined}
        >
          {getLogoUrl ? (
            <ContextSwitcherThumb
              logoUrl={logoUrl}
              alt={rótulo}
              variant={variant}
              size="md"
            />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span data-switcher-label className="min-w-0 truncate font-medium">
              {rótulo}
            </span>
            {subtítulo ? (
              <span className={`truncate text-xs ${mutedClass}`}>{subtítulo}</span>
            ) : null}
          </span>
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
          <SearchFilterInput
            inputId={`${listId}-input`}
            inputType="text"
            value={query}
            onChange={(next) => {
              setQuery(next)
              setAberto(true)
              limparTip()
            }}
            onPointerEnter={(e) => {
              if (!query.trim()) {
                limparTip()
                return
              }
              mostrarTip(query, e.currentTarget)
            }}
            onPointerLeave={limparTip}
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
            placeholder={placeholder}
            disabled={disabled || pending}
            exibirDropdown={false}
            loading={buscandoRemoto}
            listboxId={listId}
            comboboxAberto={aberto}
            ariaActivedescendant={
              aberto && sugestoes[destaque]
                ? `${listId}-opt-${sugestoes[destaque].id}`
                : undefined
            }
            leading={
              mostrarEscudoNoInput ? (
                <ContextSwitcherThumb
                  logoUrl={getLogoUrl!(selecionada!)}
                  alt={labelSelecionada}
                  variant={variant}
                />
              ) : undefined
            }
            inputClassName={inputClass}
          />
          {aberto && !disabled && (
            <ul
              id={listId}
              role="listbox"
              className={listClass}
              onScroll={limparTip}
            >
              {sugestoes.length === 0 ? (
                <li className={`px-3 py-2 text-sm ${mutedClass}`}>
                  {buscandoRemoto ? 'Buscando…' : emptyMessage}
                </li>
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
              {(truncado || buscandoRemoto) && sugestoes.length > 0 && (
                <li className={`px-3 py-1.5 text-[11px] ${mutedClass}`}>
                  {buscandoRemoto ? 'Buscando…' : 'Digite mais para refinar a busca…'}
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
