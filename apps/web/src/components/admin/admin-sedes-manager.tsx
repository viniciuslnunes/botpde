'use client'

import { useDeferredValue, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Clock,
  Crosshair,
  ImageOff,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { CriarSedeForm, ToggleSedeButton } from '@/components/admin/sede-forms'
import { geocodificarSedesSemCoords } from '@/app/admin/sedes/actions'
import {
  buildStreetViewImageUrl,
  isGoogleMapsConfigured,
} from '@/lib/google-maps'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { toast } from 'sonner'

const THUMB_W = 240
const THUMB_H = 180

/** Pai na torcida principal (Caso B) — fora deste tenant. */
export type PaiHerdadoListItem = {
  id: string
  nome: string
  tipo: string
  tenantNome: string
  logoUrl: string | null
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  endereco: string | null
  cidade: string | null
  estado: string | null
}

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
  fotoUrl: string | null
  ativa: boolean
  lat: number | null
  lng: number | null
  membrosCount: number
  /** Preenchido quando o pai está em outro tenant (promoção / afiliação). */
  paiHerdado?: PaiHerdadoListItem | null
}

type SedeOption = { id: string; nome: string; tipo: string }

type FiltroTipo = 'TODAS' | AdminSedeListItem['tipo'] | 'SEM_COORDS' | 'INATIVAS'

const TIPO_LABEL: Record<AdminSedeListItem['tipo'], string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const TIPO_CLASS: Record<AdminSedeListItem['tipo'], string> = {
  SEDE: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  SUBSEDE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  PONTO_ENCONTRO: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

type SedeLocalNode = AdminSedeListItem & { kind: 'local'; filhos: TreeNode[] }
type SedeExternoNode = {
  kind: 'externo'
  id: string
  nome: string
  tipo: string
  tenantNome: string
  logoUrl: string | null
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  filhos: TreeNode[]
}
type TreeNode = SedeLocalNode | SedeExternoNode

type CoverInput = {
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
}

function labelTipoPai(tipo: string): string {
  if (tipo === 'SEDE') return 'Sede'
  if (tipo === 'SUBSEDE') return 'Subsede'
  return 'PDE'
}

function resolveCoverUrl(sede: CoverInput): string | null {
  if (sede.fotoUrl) return sede.fotoUrl
  if (!isGoogleMapsConfigured()) return null
  if (sede.lat == null || sede.lng == null) return null
  return buildStreetViewImageUrl(
    {
      lat: sede.lat,
      lng: sede.lng,
      endereco: sede.endereco,
      cidade: sede.cidade,
      estado: sede.estado,
    },
    { width: THUMB_W, height: THUMB_H },
  )
}

function formatLocal(sede: {
  endereco: string | null
  cidade: string | null
  estado: string | null
}): string | null {
  const cidadeEstado = [sede.cidade, sede.estado].filter(Boolean).join(' — ')
  if (sede.endereco && cidadeEstado) return `${sede.endereco}, ${cidadeEstado}`
  if (sede.endereco) return sede.endereco
  return cidadeEstado || null
}

function SedeThumb({
  coverUrl,
  alt,
  size = 'md',
  fit = 'cover',
}: {
  coverUrl: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
  /** `contain` para logo de torcida (não cortar o escudo). */
  fit?: 'cover' | 'contain'
}) {
  const sizeClass =
    size === 'lg'
      ? 'h-28 w-36 sm:h-32 sm:w-44'
      : size === 'sm'
        ? 'h-14 w-16'
        : 'h-[4.75rem] w-[5.5rem] sm:h-[5.5rem] sm:w-[7rem]'

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-[rgb(var(--background-subtle))] ${sizeClass}`}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={alt}
          fill
          className={fit === 'contain' ? 'object-contain p-2.5' : 'object-cover'}
          sizes={size === 'lg' ? '176px' : size === 'sm' ? '64px' : '112px'}
          unoptimized
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-[rgb(var(--foreground-muted))]">
          <ImageOff className="h-4 w-4 opacity-45" aria-hidden />
          <span className="px-1 text-center text-[9px] font-medium uppercase tracking-wide opacity-70">
            Sem foto
          </span>
        </div>
      )}
    </div>
  )
}

function BrandMark({
  logoUrl,
  nome,
}: {
  logoUrl: string | null
  nome: string
}) {
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {logoUrl ? (
        <Image src={logoUrl} alt="" fill className="object-contain p-1" sizes="44px" unoptimized />
      ) : (
        <span className="text-sm font-bold text-[rgb(var(--color-primary-fg))]">
          {nome.trim().charAt(0).toUpperCase() || 'T'}
        </span>
      )}
    </div>
  )
}

function buildTree(sedes: AdminSedeListItem[]): TreeNode[] {
  const locais = new Map<string, SedeLocalNode>(
    sedes.map((s) => [s.id, { ...s, kind: 'local', filhos: [] }]),
  )
  const externos = new Map<string, SedeExternoNode>()
  const raizes: TreeNode[] = []

  for (const node of locais.values()) {
    const paiLocal = node.sedeId ? locais.get(node.sedeId) : undefined
    if (paiLocal) {
      paiLocal.filhos.push(node)
      continue
    }

    if (node.paiHerdado) {
      let externo = externos.get(node.paiHerdado.id)
      if (!externo) {
        externo = {
          kind: 'externo',
          id: node.paiHerdado.id,
          nome: node.paiHerdado.nome,
          tipo: node.paiHerdado.tipo,
          tenantNome: node.paiHerdado.tenantNome,
          logoUrl: node.paiHerdado.logoUrl,
          fotoUrl: node.paiHerdado.fotoUrl,
          lat: node.paiHerdado.lat,
          lng: node.paiHerdado.lng,
          endereco: node.paiHerdado.endereco,
          cidade: node.paiHerdado.cidade,
          estado: node.paiHerdado.estado,
          filhos: [],
        }
        externos.set(node.paiHerdado.id, externo)
        raizes.push(externo)
      }
      externo.filhos.push(node)
      continue
    }

    raizes.push(node)
  }

  return raizes
}

/** Mantém ancestral se algum descendente casa com o filtro. */
function filterTree(nodes: TreeNode[], pred: (s: AdminSedeListItem) => boolean): TreeNode[] {
  const out: TreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'externo') {
      const filhos = filterTree(node.filhos, pred)
      if (filhos.length > 0) out.push({ ...node, filhos })
      continue
    }
    const filhos = filterTree(node.filhos, pred)
    if (pred(node) || filhos.length > 0) {
      out.push({ ...node, filhos })
    }
  }
  return out
}

function PaiExternoCard({ node, nivel = 0 }: { node: SedeExternoNode; nivel?: number }) {
  const fotoOuStreet = resolveCoverUrl(node)
  // Torcida principal: foto da sede → Street View → logo do tenant (nunca "sem foto" se há logo).
  const coverUrl = fotoOuStreet ?? node.logoUrl
  const coverIsLogo = !fotoOuStreet && Boolean(node.logoUrl)
  const local = formatLocal(node)

  return (
    <div className={nivel > 0 ? 'ml-3 border-l border-[rgb(var(--border))] pl-3 sm:ml-5 sm:pl-5' : ''}>
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <div className="flex items-stretch gap-0">
          <SedeThumb
            coverUrl={coverUrl}
            alt={node.tenantNome}
            size="md"
            fit={coverIsLogo ? 'contain' : 'cover'}
          />
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4">
            {/* Só duplica o logo em miniatura quando a capa já é foto/Street View. */}
            {!coverIsLogo && <BrandMark logoUrl={node.logoUrl} nome={node.tenantNome} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[rgb(var(--color-primary)_/_0.12)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                  Torcida principal
                </span>
                <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  {labelTipoPai(node.tipo)} · só leitura
                </span>
              </div>
              <h3 className="mt-1 truncate text-base font-semibold text-[rgb(var(--foreground))]">
                {node.tenantNome}
              </h3>
              <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
                Unidade pai: {node.nome}
                {local ? ` · ${local}` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {node.filhos.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.filhos.map((filho) =>
            filho.kind === 'externo' ? (
              <PaiExternoCard key={filho.id} node={filho} nivel={nivel + 1} />
            ) : (
              <SedeCard key={filho.id} sede={filho} nivel={nivel + 1} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function SedeCard({ sede, nivel = 0 }: { sede: SedeLocalNode; nivel?: number }) {
  const semCoords = sede.lat == null || sede.lng == null
  const coverUrl = resolveCoverUrl(sede)
  const local = formatLocal(sede)

  return (
    <div className={nivel > 0 ? 'ml-3 border-l border-[rgb(var(--border))] pl-3 sm:ml-5 sm:pl-5' : ''}>
      <article
        className={[
          'group overflow-hidden rounded-2xl border transition-colors',
          sede.ativa
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.4)]'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-75',
        ].join(' ')}
      >
        <div className="flex items-stretch gap-0">
          <SedeThumb coverUrl={coverUrl} alt={`Foto de ${sede.nome}`} size="lg" />

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIPO_CLASS[sede.tipo]}`}
                >
                  {TIPO_LABEL[sede.tipo]}
                </span>
                {!sede.ativa && (
                  <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                    Inativa
                  </span>
                )}
                {semCoords && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    Sem mapa
                  </span>
                )}
                {!coverUrl && (
                  <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                    Sem imagem
                  </span>
                )}
              </div>

              <h3 className="mt-1.5 text-base font-semibold tracking-tight text-[rgb(var(--foreground))] sm:text-lg">
                {sede.nome}
              </h3>

              {sede.paiHerdado && nivel === 0 && (
                <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                  Pertence a {sede.paiHerdado.tenantNome}
                </p>
              )}

              {local && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="line-clamp-2">{local}</span>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgb(var(--foreground-muted))]">
                <span className="inline-flex items-center gap-1 font-medium text-[rgb(var(--foreground))]">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {sede.membrosCount} membro{sede.membrosCount !== 1 ? 's' : ''}
                </span>
                {sede.responsavel && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Users className="h-3.5 w-3.5 opacity-50" aria-hidden />
                    {sede.responsavel}
                  </span>
                )}
                {sede.telefone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {sede.telefone}
                  </span>
                )}
                {sede.capacidade != null && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    Cap. {sede.capacidade}
                  </span>
                )}
                {sede.horarios && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {sede.horarios}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-end sm:flex-col sm:items-stretch sm:self-center lg:flex-row">
              <ToggleSedeButton sedeId={sede.id} ativa={sede.ativa} />
              <Link
                href={`/admin/sedes/${sede.id}`}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-[rgb(var(--color-primary)_/_0.12)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.28)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.18)]"
              >
                Editar
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </article>

      {sede.filhos.length > 0 && (
        <div className="mt-3 space-y-3">
          {sede.filhos.map((filho) =>
            filho.kind === 'externo' ? (
              <PaiExternoCard key={filho.id} node={filho} nivel={nivel + 1} />
            ) : (
              <SedeCard key={filho.id} sede={filho} nivel={nivel + 1} />
            ),
          )}
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
  torcidaPrincipal = null,
  podeAdicionarLocal = false,
}: {
  sedes: AdminSedeListItem[]
  sedesOption: SedeOption[]
  candidatos: { id: string; nome: string | null; email: string | null }[]
  membrosSemUnidade: number
  torcidaPrincipal?: PaiHerdadoListItem | null
  /** Só Sede principal — ver `podeCriarUnidadeTerritorial`. */
  podeAdicionarLocal?: boolean
}) {
  const [busca, setBusca] = useState('')
  const buscaDeferred = useDeferredValue(busca)
  const [filtro, setFiltro] = useState<FiltroTipo>('TODAS')
  const [criando, setCriando] = useState(podeAdicionarLocal && sedes.length === 0)
  const [geoPending, startGeo] = useTransition()

  const semCoordsCount = useMemo(
    () => sedes.filter((s) => s.ativa && (s.lat == null || s.lng == null)).length,
    [sedes],
  )
  const semFotoCount = useMemo(
    () =>
      sedes.filter(
        (s) => s.ativa && !s.fotoUrl && (s.lat == null || s.lng == null || !isGoogleMapsConfigured()),
      ).length,
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
        [
          s.nome,
          s.endereco,
          s.cidade,
          s.estado,
          s.responsavel,
          s.paiHerdado?.nome,
          s.paiHerdado?.tenantNome,
        ]
          .filter(Boolean)
          .join(' '),
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
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-[rgb(var(--foreground-muted))]">
          {membrosSemUnidade > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {membrosSemUnidade} membro{membrosSemUnidade !== 1 ? 's' : ''} sem unidade
            </span>
          )}
          {semCoordsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {semCoordsCount} sem coordenadas
            </span>
          )}
          {semFotoCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1">
              <ImageOff className="h-3.5 w-3.5" aria-hidden />
              {semFotoCount} sem imagem
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {semCoordsCount > 0 && isGoogleMapsConfigured() && (
            <button
              type="button"
              onClick={geocodeLote}
              disabled={geoPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
            >
              {geoPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              Geocodificar {semCoordsCount}
            </button>
          )}
          {podeAdicionarLocal && !criando && (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--primary))] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Adicionar local
            </button>
          )}
        </div>
      </div>

      {torcidaPrincipal && (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 sm:px-4">
          <BrandMark logoUrl={torcidaPrincipal.logoUrl} nome={torcidaPrincipal.tenantNome} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Afiliado a {torcidaPrincipal.tenantNome}
            </p>
            <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
              A sede pai aparece na estrutura como referência (somente leitura).
              Novos locais só podem ser criados pela sede principal.
            </p>
          </div>
          <Shield className="hidden h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))] sm:block" aria-hidden />
        </div>
      )}

      {podeAdicionarLocal && criando && (
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
                <Plus className="h-4 w-4" />
                Novo local
              </h2>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Identidade, localização e operação — em 3 etapas.
              </p>
            </div>
            {sedes.length > 0 && (
              <button
                type="button"
                onClick={() => setCriando(false)}
                className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="p-5 sm:p-6">
            <CriarSedeForm
              sedes={sedesOption}
              candidatos={candidatos}
              onCancel={sedes.length > 0 ? () => setCriando(false) : undefined}
            />
          </div>
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
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Estrutura
          </h2>
          <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
            Foto da unidade ou Street View automático
          </p>
        </div>

        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-14 text-center">
            <AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">
              {sedes.length === 0 ? 'Nenhuma sede cadastrada' : 'Nenhum resultado com esses filtros'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-[rgb(var(--foreground-muted))]">
              {sedes.length === 0
                ? 'Cadastre a primeira unidade para montar o mapa e a hierarquia.'
                : 'Ajuste a busca ou limpe os filtros.'}
            </p>
            {sedes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  setFiltro('TODAS')
                }}
                className="mt-3 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {tree.map((node) =>
              node.kind === 'externo' ? (
                <PaiExternoCard key={`ext-${node.id}`} node={node} />
              ) : (
                <SedeCard key={node.id} sede={node} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
