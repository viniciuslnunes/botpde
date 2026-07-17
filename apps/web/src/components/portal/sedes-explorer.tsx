'use client'

import { useEffect, useMemo, useRef, useState, useTransition, useDeferredValue } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AlertCircle, Crosshair, Loader2, Search, X } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { SedeExplorerCard } from '@/components/portal/sede-explorer-card'
import { SedeExplorerDetail } from '@/components/portal/sede-explorer-detail'
import {
  TIPO_LABEL,
  type SedeExplorerItem,
  type SedeTipo,
} from '@/components/portal/sede-explorer-types'
import { enrichSedesComCoordenadas, isGoogleMapsConfigured } from '@/lib/google-maps'
import {
  distanciaKm,
  normalizarTexto,
  type LocalizacaoOnboarding,
} from '@/lib/onboarding-unidade'

const SedesMap = dynamic(
  () => import('@/components/portal/sedes-map').then((m) => m.SedesMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[14rem] w-full animate-pulse rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] sm:h-[18rem] lg:h-[22rem]" />
    ),
  },
)

type FiltroTipo = 'TODAS' | SedeTipo

const FILTROS: Array<{ id: FiltroTipo; label: string }> = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'SEDE', label: TIPO_LABEL.SEDE },
  { id: 'SUBSEDE', label: TIPO_LABEL.SUBSEDE },
  { id: 'PONTO_ENCONTRO', label: TIPO_LABEL.PONTO_ENCONTRO },
]

type Props = {
  sedes: SedeExplorerItem[]
  initialSelectedId: string | null
}

export function SedesExplorer({ sedes: sedesIniciais, initialSelectedId }: Props) {
  const router = useRouter()
  const listRef = useRef<HTMLDivElement>(null)
  const mapPanelRef = useRef<HTMLElement>(null)
  const enrichedOnce = useRef(false)

  const [sedes, setSedes] = useState(sedesIniciais)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && sedesIniciais.some((s) => s.id === initialSelectedId)
      ? initialSelectedId
      : null,
  )
  const [filtro, setFiltro] = useState<FiltroTipo>('TODAS')
  const [busca, setBusca] = useState('')
  const buscaDeferred = useDeferredValue(busca)
  const [localizacao, setLocalizacao] = useState<LocalizacaoOnboarding | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [enriching, setEnriching] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!isGoogleMapsConfigured() || enrichedOnce.current) return
    const missing = sedesIniciais.some((s) => s.lat == null || s.lng == null)
    if (!missing) {
      enrichedOnce.current = true
      return
    }
    enrichedOnce.current = true
    let cancelled = false
    setEnriching(true)
    void enrichSedesComCoordenadas(sedesIniciais).then((enriched) => {
      if (!cancelled) {
        setSedes(enriched)
        setEnriching(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [sedesIniciais])

  function selecionar(id: string | null) {
    setSelectedId(id)
    startTransition(() => {
      const url = id ? `/portal/sedes?sede=${encodeURIComponent(id)}` : '/portal/sedes'
      router.replace(url, { scroll: false })
    })
    if (id && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-sede-id="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    // Mobile: leva o mapa/detalhe à vista após selecionar
    if (id && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => {
        mapPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      })
    }
  }

  function pedirLocalizacao() {
    if (!navigator.geolocation) {
      setGeoStatus('error')
      return
    }
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus('idle')
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const contagens = useMemo(() => {
    const c: Record<FiltroTipo, number> = {
      TODAS: sedes.length,
      SEDE: 0,
      SUBSEDE: 0,
      PONTO_ENCONTRO: 0,
    }
    for (const s of sedes) c[s.tipo] += 1
    return c
  }, [sedes])

  const filtradas = useMemo(() => {
    const q = normalizarTexto(buscaDeferred)
    let list = sedes.filter((s) => {
      if (filtro !== 'TODAS' && s.tipo !== filtro) return false
      if (!q) return true
      const hay = normalizarTexto(
        [s.nome, s.endereco, s.cidade, s.estado, s.responsavel].filter(Boolean).join(' '),
      )
      return hay.includes(q)
    })

    if (localizacao) {
      list = [...list].sort((a, b) => {
        const da = distanciaKm(localizacao, a)
        const db = distanciaKm(localizacao, b)
        if (da == null && db == null) return a.nome.localeCompare(b.nome, 'pt-BR')
        if (da == null) return 1
        if (db == null) return -1
        return da - db
      })
    }

    return list
  }, [sedes, filtro, buscaDeferred, localizacao])

  // Mapa sempre com o universo completo (pins estáveis); lista reflete filtros
  const mapPoints = useMemo(
    () => sedes.map((s) => ({ id: s.id, nome: s.nome, lat: s.lat, lng: s.lng })),
    [sedes],
  )

  const selected = selectedId ? (sedes.find((s) => s.id === selectedId) ?? null) : null
  const selectedDist =
    selected && localizacao ? distanciaKm(localizacao, selected) : null
  const buscaPendente = busca !== buscaDeferred

  if (sedes.length === 0) {
    return (
      <MotionEmptyState
        icon={<AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhuma sede cadastrada"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, cidade ou endereço"
              aria-label="Buscar sedes"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-9 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filtrar por tipo">
            {FILTROS.map((f) => {
              const count = contagens[f.id]
              if (f.id !== 'TODAS' && count === 0) return null
              const active = filtro === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFiltro(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[rgb(var(--color-primary))] text-white'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'opacity-70'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={pedirLocalizacao}
              disabled={geoStatus === 'loading'}
              aria-pressed={localizacao != null}
              className={`ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                localizacao
                  ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50'
              }`}
            >
              {geoStatus === 'loading' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Crosshair className="h-3 w-3" />
              )}
              Perto de mim
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--foreground-muted))]">
            <p className={buscaPendente ? 'opacity-60' : undefined}>
              {filtradas.length === sedes.length
                ? `${sedes.length} ${sedes.length === 1 ? 'local' : 'locais'}`
                : `${filtradas.length} de ${sedes.length} locais`}
            </p>
            {enriching && <p>Atualizando mapa…</p>}
          </div>

          {geoStatus === 'error' && (
            <p className="text-[11px] text-red-500" role="alert">
              Não foi possível obter sua localização. Verifique a permissão do navegador.
            </p>
          )}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5 lg:pr-1">
          {filtradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Nenhuma sede encontrada com esses filtros.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  setFiltro('TODAS')
                }}
                className="mt-2 text-xs font-medium text-[rgb(var(--color-primary))] hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtradas.map((sede, index) => (
                <li key={sede.id}>
                  <SedeExplorerCard
                    sede={sede}
                    selected={sede.id === selectedId}
                    distanciaKm={localizacao ? distanciaKm(localizacao, sede) : null}
                    onSelect={() => selecionar(sede.id)}
                    priority={index < 4}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section ref={mapPanelRef} className="flex min-w-0 flex-col gap-4 scroll-mt-20">
        <SedesMap
          sedes={mapPoints}
          selectedId={selectedId}
          onSelect={selecionar}
          className="h-[14rem] w-full sm:h-[18rem] lg:sticky lg:top-20 lg:h-[22rem] lg:z-10"
        />

        {selected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Detalhe
              </p>
              <button
                type="button"
                onClick={() => selecionar(null)}
                className="text-xs font-medium text-[rgb(var(--color-primary))] hover:underline"
              >
                Limpar seleção
              </button>
            </div>
            <SedeExplorerDetail
              key={selected.id}
              sede={selected}
              distanciaKm={selectedDist}
              onSelectFilho={selecionar}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/50 px-5 py-10 text-center">
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">
              Selecione uma sede na lista ou no mapa
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Veja fachada, endereço, horários, rotas e próximos eventos
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
