'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Crown, Loader2, MapPin, Search, X } from 'lucide-react'
import {
  PARAM_BUSCA,
  construirHrefListagem,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import { ocultosPreservados } from '@/lib/listagem/ui'
import type { SugestaoLideranca } from '@/app/api/super-admin/liderancas/busca/route'

const DEBOUNCE_MS = 280

function IconeTipo({ tipo }: { tipo: SugestaoLideranca['tipo'] }) {
  if (tipo === 'lider') return <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden />
  if (tipo === 'unidade') return <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
  return <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
}

/**
 * Busca com typeahead: digitar sugere torcidas/unidades/líderes; escolher uma
 * sugestão abre só aquela torcida-raiz (`?raiz=`). Enter / debounce aplica `?q=`
 * como o ListagemForm padrão.
 */
export function LiderancasBuscaInteligente({
  spec,
  params,
  raizId,
}: {
  spec: ListagemSpec
  params: ListagemParams
  raizId: string | null
}) {
  const router = useRouter()
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [q, setQ] = useState(params.q)
  const [sugestoes, setSugestoes] = useState<SugestaoLideranca[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [pendente, startTransition] = useTransition()

  useEffect(() => {
    setQ(params.q)
  }, [params.q])

  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) {
      setSugestoes([])
      setCarregandoSugestoes(false)
      return
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setCarregandoSugestoes(true)
      void fetch(`/api/super-admin/liderancas/busca?q=${encodeURIComponent(termo)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = (await res.json()) as { sugestoes?: SugestaoLideranca[] }
          if (!res.ok) throw new Error('Falha na busca')
          setSugestoes(data.sugestoes ?? [])
          setAberto(true)
          setAtivo(-1)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setSugestoes([])
        })
        .finally(() => {
          if (abortRef.current === controller) setCarregandoSugestoes(false)
        })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [q])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    function fora(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  function hrefBusca(proximoQ: string, proximaRaiz: string | null) {
    return construirHrefListagem(spec, params, {
      pagina: 1,
      q: proximoQ.trim() ? proximoQ.trim() : null,
      extras: {
        raiz: proximaRaiz || undefined,
      },
    })
  }

  function navegar(proximoQ: string, proximaRaiz: string | null = null) {
    const href = hrefBusca(proximoQ, proximaRaiz)
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
    setAberto(false)
  }

  function escolher(s: SugestaoLideranca) {
    setQ(s.label)
    navegar(s.label, s.raizId)
  }

  function limpar() {
    setQ('')
    setSugestoes([])
    navegar('', null)
  }

  const ocultos = ocultosPreservados(spec, params, null, {
    raiz: raizId ?? undefined,
  }).filter((c) => c.nome !== PARAM_BUSCA && c.nome !== 'raiz')

  const Icone = pendente || carregandoSugestoes ? Loader2 : Search
  const mostrarLista = aberto && q.trim().length >= 2

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 sm:max-w-md">
      <form
        method="GET"
        action={spec.basePath}
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          if (ativo >= 0 && sugestoes[ativo]) {
            escolher(sugestoes[ativo]!)
            return
          }
          navegar(q, null)
        }}
      >
        {ocultos.map((campo) => (
          <input key={campo.nome} type="hidden" name={campo.nome} value={campo.valor} />
        ))}
        <Icone
          className={[
            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
            pendente || carregandoSugestoes
              ? 'animate-spin text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))]',
          ].join(' ')}
          aria-hidden
        />
        <input
          type="search"
          name={PARAM_BUSCA}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setAberto(true)
          }}
          onFocus={() => {
            if (q.trim().length >= 2) setAberto(true)
          }}
          onKeyDown={(e) => {
            if (!mostrarLista || sugestoes.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAtivo((i) => (i + 1) % sugestoes.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAtivo((i) => (i <= 0 ? sugestoes.length - 1 : i - 1))
            } else if (e.key === 'Escape') {
              setAberto(false)
            }
          }}
          placeholder={spec.buscaPlaceholder ?? 'Buscar…'}
          aria-label={spec.buscaPlaceholder ?? 'Buscar lideranças'}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={mostrarLista}
          autoComplete="off"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-9 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary)_/_0.3)]"
        />
        {(q || raizId) && (
          <button
            type="button"
            onClick={limpar}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            aria-label="Limpar busca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="submit" className="sr-only">
          Buscar
        </button>
      </form>

      {mostrarLista && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
        >
          {carregandoSugestoes && sugestoes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]">Buscando…</li>
          ) : sugestoes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma sugestão — Enter busca o texto livre.
            </li>
          ) : (
            sugestoes.map((s, i) => (
              <li key={`${s.tipo}-${s.raizId}-${s.label}-${i}`} role="option" aria-selected={i === ativo}>
                <button
                  type="button"
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(s)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === ativo
                      ? 'bg-[rgb(var(--color-primary)_/_0.12)]'
                      : 'hover:bg-[rgb(var(--background-subtle))]'
                  }`}
                >
                  <span className="mt-0.5 text-[rgb(var(--foreground-muted))]">
                    <IconeTipo tipo={s.tipo} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                      {s.label}
                    </span>
                    <span className="block truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                      {s.sublabel}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
