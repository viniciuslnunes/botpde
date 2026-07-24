'use client'

import { useDeferredValue, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Clock,
  Crosshair,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { CriarSedeForm, ToggleSedeButton } from '@/components/admin/sede-forms'
import { geocodificarSedesSemCoords } from '@/app/admin/sedes/actions'
import { isGoogleMapsConfigured } from '@/lib/google-maps'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { toast } from 'sonner'

export type AdminSedeListItem = {
  id: string
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  sedeId: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  telefone: string | null
  horarios: string | null
  capacidade: number | null
  responsavel: string | null
  ativa: boolean
  lat: number | null
  lng: number | null
  membrosCount: number
}

type SedeOption = { id: string; nome: string; tipo: string }

type FiltroTipo = 'TODAS' | AdminSedeListItem['tipo'] | 'SEM_COORDS' | 'INATIVAS'

const TIPO_LABEL: Record<AdminSedeListItem['tipo'], string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const TIPO_CLASS: Record<AdminSedeListItem['tipo'], string> = {
  SEDE: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  SUBSEDE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PONTO_ENCONTRO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}

type SedeNode = AdminSedeListItem & { filhos: SedeNode[] }

function buildTree(sedes: AdminSedeListItem[]): SedeNode[] {
  const nodes = new Map<string, SedeNode>(sedes.map((s) => [s.id, { ...s, filhos: [] }]))
  const raizes: SedeNode[] = []
  for (const node of nodes.values()) {
    const pai = node.sedeId ? nodes.get(node.sedeId) : undefined
    if (pai) pai.filhos.push(node)
    else raizes.push(node)
  }
  return raizes
}

/** Mantém ancestral se algum descendente casa com o filtro. */
function filterTree(nodes: SedeNode[], pred: (s: AdminSedeListItem) => boolean): SedeNode[] {
  const out: SedeNode[] = []
  for (const node of nodes) {
    const filhos = filterTree(node.filhos, pred)
    if (pred(node) || filhos.length > 0) {
      out.push({ ...node, filhos })
    }
  }
  return out
}

function SedeCard({ sede, nivel = 0 }: { sede: SedeNode; nivel?: number }) {
  const semCoords = sede.lat == null || sede.lng == null

  return (
    <div className={nivel > 0 ? 'ml-4 border-l-2 border-[rgb(var(--border))] pl-3 sm:ml-6 sm:pl-4' : ''}>
      <div
        className={[
          'rounded-xl border p-4 transition-colors',
          sede.ativa
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIPO_CLASS[sede.tipo]}`}>
                {TIPO_LABEL[sede.tipo]}
              </span>
              <h3 className="font-semibold text-[rgb(var(--foreground))]">{sede.nome}</h3>
              {!sede.ativa && (
                <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                  Inativa
                </span>
              )}
              {semCoords && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Sem coordenadas
                </span>
              )}
            </div>

            {(sede.cidade || sede.endereco) && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {sede.endereco
                    ? `${sede.endereco}${sede.cidade ? `, ${sede.cidade}` : ''}`
                    : sede.cidade}
                  {sede.estado ? ` — ${sede.estado}` : ''}
                </span>
              </div>
            )}

            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1 font-medium text-[rgb(var(--foreground))]">
                <Users className="h-3.5 w-3.5" />
                {sede.membrosCount} membro{sede.membrosCount !== 1 ? 's' : ''}
              </span>
              {sede.responsavel && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 opacity-50" />
                  {sede.responsavel}
                </span>
              )}
              {sede.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {sede.telefone}
                </span>
              )}
              {sede.capacidade != null && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Cap. {sede.capacidade}
                </span>
              )}
              {sede.horarios && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {sede.horarios}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ToggleSedeButton sedeId={sede.id} ativa={sede.ativa} />
            <Link
              href={`/admin/sedes/${sede.id}`}
              className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              Editar
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {sede.filhos.length > 0 && (
        <div className="mt-3 space-y-3">
          {sede.filhos.map((filho) => (
            <SedeCard key={filho.id} sede={filho} nivel={nivel + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminSedesManager({
  sedes,
  sedesOption,
  candidatos,
  membrosSemUnidade,
}: {
  sedes: AdminSedeListItem[]
  sedesOption: SedeOption[]
  candidatos: { id: string; nome: string | null; email: string | null }[]
  membrosSemUnidade: number
}) {
  const [busca, setBusca] = useState('')
  const buscaDeferred = useDeferredValue(busca)
  const [filtro, setFiltro] = useState<FiltroTipo>('TODAS')
  const [criando, setCriando] = useState(sedes.length === 0)
  const [geoPending, startGeo] = useTransition()

  const semCoordsCount = useMemo(
    () => sedes.filter((s) => s.ativa && (s.lat == null || s.lng == null)).length,
    [sedes],
  )
  const inativasCount = useMemo(() => sedes.filter((s) => !s.ativa).length, [sedes])

  const contagens = useMemo(() => {
    const c = { TODAS: sedes.length, SEDE: 0, SUBSEDE: 0, PONTO_ENCONTRO: 0 }
    for (const s of sedes) c[s.tipo] += 1
    return c
  }, [sedes])

  const tree = useMemo(() => {
    const q = normalizarTexto(buscaDeferred)
    const pred = (s: AdminSedeListItem) => {
      if (filtro === 'SEM_COORDS' && !(s.lat == null || s.lng == null)) return false
      if (filtro === 'INATIVAS' && s.ativa) return false
      if (filtro === 'SEDE' || filtro === 'SUBSEDE' || filtro === 'PONTO_ENCONTRO') {
        if (s.tipo !== filtro) return false
      }
      if (!q) return true
      const hay = normalizarTexto(
        [s.nome, s.endereco, s.cidade, s.estado, s.responsavel].filter(Boolean).join(' '),
      )
      return hay.includes(q)
    }
    return filterTree(buildTree(sedes), pred)
  }, [sedes, buscaDeferred, filtro])

  const filtros: Array<{ id: FiltroTipo; label: string; count: number }> = [
    { id: 'TODAS', label: 'Todas', count: contagens.TODAS },
    { id: 'SEDE', label: 'Sede', count: contagens.SEDE },
    { id: 'SUBSEDE', label: 'Subsede', count: contagens.SUBSEDE },
    { id: 'PONTO_ENCONTRO', label: 'PDE', count: contagens.PONTO_ENCONTRO },
    { id: 'SEM_COORDS', label: 'Sem mapa', count: semCoordsCount },
    { id: 'INATIVAS', label: 'Inativas', count: inativasCount },
  ]

  function geocodeLote() {
    startGeo(async () => {
      const result = await geocodificarSedesSemCoords()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Hierarquia territorial Sede → Subsede → PDE — base do mapa, eventos e cadastro
          </p>
          {membrosSemUnidade > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {membrosSemUnidade} membro{membrosSemUnidade !== 1 ? 's' : ''} aprovado
              {membrosSemUnidade !== 1 ? 's' : ''} sem unidade vinculada
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {semCoordsCount > 0 && isGoogleMapsConfigured() && (
            <button
              type="button"
              onClick={geocodeLote}
              disabled={geoPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
            >
              {geoPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              Geocodificar {semCoordsCount}
            </button>
          )}
          {!criando && (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Adicionar local
            </button>
          )}
        </div>
      </div>

      {criando && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <Plus className="h-4 w-4" />
              Adicionar sede / local
            </h2>
            {sedes.length > 0 && (
              <button
                type="button"
                onClick={() => setCriando(false)}
                className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <CriarSedeForm
            sedes={sedesOption}
            candidatos={candidatos}
            onCancel={sedes.length > 0 ? () => setCriando(false) : undefined}
          />
        </div>
      )}

      <div className="space-y-3">
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

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar sedes">
          {filtros.map((f) => {
            if (f.id !== 'TODAS' && f.count === 0) return null
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
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        {semCoordsCount > 0 && filtro === 'TODAS' && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            {semCoordsCount} local{semCoordsCount !== 1 ? 'is' : ''} sem coordenadas — o mapa do portal
            fica incompleto. Edite e use “Geocodificar endereço”.
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Estrutura
        </h2>

        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              {sedes.length === 0 ? 'Nenhuma sede cadastrada' : 'Nenhum resultado com esses filtros'}
            </p>
            {sedes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  setFiltro('TODAS')
                }}
                className="mt-2 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {tree.map((sede) => (
              <SedeCard key={sede.id} sede={sede} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
