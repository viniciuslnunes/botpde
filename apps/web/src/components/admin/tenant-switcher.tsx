'use client'

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react'
import { flushSync, useFormStatus } from 'react-dom'
import { Clock, Loader2, Search } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  selecionarTorcidaAction,
  type SelecionarTorcidaState,
} from '@/app/admin/tenant-context-actions'
import {
  labelClubeComUf,
  labelTorcidaComClube,
  type TorcidaOpcao,
} from '@/lib/tenant-context'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import {
  lerTorcidasRecentes,
  registrarTorcidaRecente,
} from '@/lib/torcida-switcher-recentes'

const MAX_SUGESTOES = 40

function SubmitOnChange({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus()
  const busy = pending || formPending
  if (busy) {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden />
  }
  return null
}

function coincideBusca(t: TorcidaOpcao, alvo: string): boolean {
  if (!alvo) return true
  const haystack = normalizarTexto(
    [t.nome, t.clubeNome ?? '', t.clubeUf ?? '', t.slug].join(' '),
  )
  return haystack.includes(alvo)
}

type Props = {
  torcidas: TorcidaOpcao[]
  torcidaAtualSlug: string | null
  destino?: 'admin' | 'portal' | 'super-admin'
  variant?: 'admin' | 'super-admin'
}

export function TenantSwitcher({
  torcidas,
  torcidaAtualSlug,
  destino = 'admin',
  variant = 'admin',
}: Props) {
  const listId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState<SelecionarTorcidaState, FormData>(
    selecionarTorcidaAction,
    {},
  )
  const wasPending = useRef(false)

  const atual = useMemo(
    () => torcidas.find((t) => t.slug === torcidaAtualSlug) ?? null,
    [torcidas, torcidaAtualSlug],
  )

  const [query, setQuery] = useState(() => (atual ? labelTorcidaComClube(atual) : ''))
  const [slug, setSlug] = useState(torcidaAtualSlug ?? '')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const [recentesSlugs, setRecentesSlugs] = useState<string[]>([])

  const [prevSlug, setPrevSlug] = useState(torcidaAtualSlug)
  if (torcidaAtualSlug !== prevSlug) {
    setPrevSlug(torcidaAtualSlug)
    const next = torcidas.find((t) => t.slug === torcidaAtualSlug) ?? null
    setSlug(torcidaAtualSlug ?? '')
    setQuery(next ? labelTorcidaComClube(next) : '')
  }

  useEffect(() => {
    setRecentesSlugs(lerTorcidasRecentes())
  }, [])

  useEffect(() => {
    if (wasPending.current && !pending && state.message) {
      toast.error(state.message)
    }
    wasPending.current = pending
  }, [pending, state.message])

  const porSlug = useMemo(() => {
    const map = new Map<string, TorcidaOpcao>()
    for (const t of torcidas) map.set(t.slug, t)
    return map
  }, [torcidas])

  const selecionada = porSlug.get(slug) ?? null
  const labelSelecionada = selecionada ? labelTorcidaComClube(selecionada) : ''

  // Com o campo mostrando a seleção atual, não filtrar — listar recentes + base.
  const alvoBusca = useMemo(() => {
    const n = normalizarTexto(query)
    if (!n) return ''
    if (n === normalizarTexto(labelSelecionada)) return ''
    return n
  }, [query, labelSelecionada])

  const { recentes, demais, truncado } = useMemo(() => {
    const recenteSet = new Set(recentesSlugs)
    const recentesLista: TorcidaOpcao[] = []
    for (const s of recentesSlugs) {
      const t = porSlug.get(s)
      if (t && coincideBusca(t, alvoBusca)) recentesLista.push(t)
    }

    const demaisLista = torcidas.filter(
      (t) => !recenteSet.has(t.slug) && coincideBusca(t, alvoBusca),
    )

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
  }, [torcidas, porSlug, recentesSlugs, alvoBusca])

  const sugestoes = useMemo(() => [...recentes, ...demais], [recentes, demais])

  useEffect(() => {
    setDestaque(0)
  }, [alvoBusca, aberto])

  function selecionar(t: TorcidaOpcao) {
    registrarTorcidaRecente(t.slug)
    setRecentesSlugs(lerTorcidasRecentes())
    flushSync(() => {
      setSlug(t.slug)
      setQuery(labelTorcidaComClube(t))
      setAberto(false)
    })
    formRef.current?.requestSubmit()
  }

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
    : 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
  const mutedClass = isSuper ? 'text-zinc-500' : 'text-[rgb(var(--foreground-muted))]'
  const sectionClass = isSuper
    ? 'flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500'
    : 'flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]'
  const iconClass = isSuper
    ? 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500'
    : 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]'

  function renderItem(t: TorcidaOpcao, i: number) {
    const ativa = t.slug === slug
    const destaqueItem = i === destaque
    const subtítulo = labelClubeComUf(t)
    return (
      <li key={t.id} role="option" aria-selected={ativa} id={`${listId}-opt-${t.id}`}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            selecionar(t)
          }}
          onMouseEnter={() => setDestaque(i)}
          className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
            destaqueItem || ativa ? itemActive : itemIdle
          }`}
        >
          <span className="truncate font-medium">{t.nome}</span>
          {subtítulo ? (
            <span className={`truncate text-xs ${mutedClass}`}>{subtítulo}</span>
          ) : (
            <span className={`truncate font-mono text-[11px] ${mutedClass}`}>{t.slug}</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <form ref={formRef} action={action} className="space-y-1">
      <input type="hidden" name="destino" value={destino} />
      <input type="hidden" name="slug" value={slug} />
      <label className={labelClass} htmlFor={`${listId}-input`}>
        Torcida ativa
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
              aberto && sugestoes[destaque] ? `${listId}-opt-${sugestoes[destaque].id}` : undefined
            }
            value={query}
            disabled={pending}
            autoComplete="off"
            placeholder="Buscar torcida, clube ou UF…"
            className={inputClass}
            onChange={(e) => {
              setQuery(e.target.value)
              setAberto(true)
            }}
            onFocus={(e) => {
              setAberto(true)
              e.target.select()
            }}
            onBlur={() => {
              setAberto(false)
              const sel = porSlug.get(slug)
              setQuery(sel ? labelTorcidaComClube(sel) : '')
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
                selecionar(sugestoes[destaque])
              } else if (e.key === 'Escape') {
                setAberto(false)
              }
            }}
          />
          {aberto && (
            <ul id={listId} role="listbox" className={listClass}>
              {sugestoes.length === 0 ? (
                <li className={`px-3 py-2 text-sm ${mutedClass}`}>
                  Nenhuma torcida encontrada.
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
              {truncado && (
                <li className={`px-3 py-1.5 text-[11px] ${mutedClass}`}>
                  Digite mais para refinar a busca…
                </li>
              )}
            </ul>
          )}
        </div>
        <SubmitOnChange pending={pending} />
      </div>
      {isSuper && (
        <p className="text-xs text-zinc-500">
          Ao trocar, você entra no admin da torcida escolhida (membros, aprovações, eventos…).
        </p>
      )}
    </form>
  )
}
