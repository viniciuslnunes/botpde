'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import type { MemoriaEscopo } from '@torcida/types'
import { buscarMemoriaAction } from '../actions'
import type { MemoriaBuscaHit } from '../_lib/memoria-busca'

type Props = {
  escopo: MemoriaEscopo
}

export function MemoriaBusca({ escopo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [termo, setTermo] = useState('')
  const [hits, setHits] = useState<MemoriaBuscaHit[]>([])
  const [aberto, setAberto] = useState(false)
  const [pending, start] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const t = termo.trim()
    if (t.length < 2) {
      setHits([])
      return
    }
    debounceRef.current = setTimeout(() => {
      start(async () => {
        const res = await buscarMemoriaAction({ termo: t, escopo })
        setHits(res.hits ?? [])
        setAberto(true)
      })
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [termo, escopo])

  function irPara(dia: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('escopo', escopo)
    p.set('dia', dia)
    router.replace(`/portal/memoria?${p.toString()}`, { scroll: false })
    setAberto(false)
    setTermo('')
    setHits([])
  }

  return (
    <div className="relative mb-3">
      <label className="block">
        <span className="sr-only">Buscar no acervo</span>
        <span className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]"
            aria-hidden
          />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onFocus={() => hits.length > 0 && setAberto(true)}
            placeholder="Buscar no acervo…"
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-9 text-base text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))]"
          />
          {termo && (
            <button
              type="button"
              onClick={() => {
                setTermo('')
                setHits([])
                setAberto(false)
              }}
              className="app-touch-target absolute right-1 flex items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))]"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </span>
      </label>

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
          {pending && (
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
              Buscando…
            </p>
          )}
          {!pending && hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-[rgb(var(--foreground-muted))]">
              Nada encontrado neste recorte.
            </p>
          )}
          {!pending && hits.length > 0 && (
            <ul>
              {hits.map((h) => (
                <li key={`${h.dia}-${h.tipo}-${h.titulo.slice(0, 24)}`}>
                  <button
                    type="button"
                    onClick={() => irPara(h.dia)}
                    className="app-touch-target flex w-full min-w-0 flex-col gap-0.5 border-b border-[rgb(var(--border)_/_0.5)] px-3 py-2.5 text-left last:border-0 hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[rgb(var(--color-primary-fg))]">
                      {h.dia} · {rotuloTipo(h.tipo)}
                    </span>
                    <span className="line-clamp-2 text-sm text-[rgb(var(--foreground))]">{h.titulo}</span>
                    {h.subtitulo && (
                      <span className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                        {h.subtitulo}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function rotuloTipo(tipo: MemoriaBuscaHit['tipo']): string {
  if (tipo === 'partida') return 'Jogo'
  if (tipo === 'evento') return 'Evento'
  if (tipo === 'fato') return 'Memória'
  return 'Publicação'
}
