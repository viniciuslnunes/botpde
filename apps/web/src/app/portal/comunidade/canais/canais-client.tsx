'use client'

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  Crosshair,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatNomeTorcida } from '@torcida/types'
import { criarCanalTematico, entrarCanal, pedirEntradaCanal } from '@/app/portal/comunidade/actions'
import { LogoImage } from '@/components/media/logo-image'
import { Avatar } from '@/components/portal/avatar'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import {
  distanciaKm,
  formatarDistanciaKm,
  normalizarTexto,
  type LocalizacaoOnboarding,
} from '@/lib/onboarding-unidade'
import {
  agruparCanaisPorSecao,
  canalCombinaUfCidade,
  listarCidadesCanais,
  listarUfsCanais,
  SECAO_CANAL_LABEL,
} from '@/lib/canais-listagem'
import {
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkCanalComunidade,
  type CanalItem,
} from '@/lib/canais-shared'
import { nomesEquivalentes } from '@/lib/torcida-labels'

/** Mesma chave do explorer de sedes — localização persiste entre telas do portal. */
const GEO_STORAGE_KEY = 'portal:sedes:geo'

type FiltroCanal = 'TODOS' | 'OFICIAIS' | 'TEMATICOS' | 'MINHAS' | 'ENTRAR'
type OrdenacaoCanal = 'relevancia' | 'proximidade' | 'membros' | 'nome'

interface CanaisClientProps {
  canais: CanalItem[]
  podeCriarCanal: boolean
  tenantAtualId: string
}

function lerGeoSalva(): LocalizacaoOnboarding | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(GEO_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'lat' in parsed &&
      'lng' in parsed &&
      typeof (parsed as { lat: unknown }).lat === 'number' &&
      typeof (parsed as { lng: unknown }).lng === 'number'
    ) {
      return { lat: (parsed as { lat: number }).lat, lng: (parsed as { lng: number }).lng }
    }
  } catch {
    /* ignore */
  }
  return null
}

function salvarGeo(loc: LocalizacaoOnboarding | null) {
  if (typeof window === 'undefined') return
  try {
    if (loc) sessionStorage.setItem(GEO_STORAGE_KEY, JSON.stringify(loc))
    else sessionStorage.removeItem(GEO_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function localizacaoLabel(canal: CanalItem): string | null {
  if (canal.cidade && canal.estado) return `${canal.cidade} · ${canal.estado}`
  if (canal.cidade) return canal.cidade
  if (canal.estado) return canal.estado
  return null
}

function compararRelevancia(a: CanalItem, b: CanalItem, tenantAtualId: string): number {
  if (a.souMembro !== b.souMembro) return a.souMembro ? -1 : 1
  if (a.tenantId === tenantAtualId && b.tenantId !== tenantAtualId) return -1
  if (b.tenantId === tenantAtualId && a.tenantId !== tenantAtualId) return 1
  if (a.canalOficial !== b.canalOficial) return a.canalOficial ? -1 : 1
  return b.membros - a.membros
}

export function CanaisClient({
  canais: canaisIniciais,
  podeCriarCanal,
  tenantAtualId,
}: CanaisClientProps) {
  const [canais, setCanais] = useState(canaisIniciais)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'comunidade',
    title: 'Ajustar foto do canal',
    onDone: ({ url }) => {
      if (url) {
        setAvatarUrl(url)
        toast.success('Foto pronta para o canal.')
      }
    },
  })
  const [visibilidade, setVisibilidade] = useState<'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'>(
    'ALIADOS',
  )
  const [privado, setPrivado] = useState(false)
  const [pending, startTransition] = useTransition()

  const [busca, setBusca] = useState('')
  const buscaDeferred = useDeferredValue(busca)
  const [filtro, setFiltro] = useState<FiltroCanal>('TODOS')
  const [ordenacao, setOrdenacao] = useState<OrdenacaoCanal>('relevancia')
  const [filtroUf, setFiltroUf] = useState<string | null>(null)
  const [filtroCidade, setFiltroCidade] = useState<string | null>(null)
  const [localizacao, setLocalizacao] = useState<LocalizacaoOnboarding | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    const salva = lerGeoSalva()
    if (salva) {
      setLocalizacao(salva)
      setOrdenacao((prev) => (prev === 'relevancia' ? 'proximidade' : prev))
    }

    let cancelled = false
    function aplicarPosicao(pos: GeolocationPosition) {
      if (cancelled) return
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setLocalizacao(next)
      salvarGeo(next)
      setGeoStatus('idle')
      setOrdenacao((prev) => (prev === 'relevancia' ? 'proximidade' : prev))
    }

    if (!navigator.geolocation) return
    const permissions = navigator.permissions
    if (permissions?.query) {
      void permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (cancelled || status.state !== 'granted') return
          navigator.geolocation.getCurrentPosition(aplicarPosicao, () => undefined, {
            enableHighAccuracy: false,
            timeout: 8_000,
            maximumAge: 120_000,
          })
        })
        .catch(() => undefined)
    }

    return () => {
      cancelled = true
    }
  }, [])

  const ufsDisponiveis = useMemo(() => listarUfsCanais(canais), [canais])
  const cidadesDisponiveis = useMemo(
    () => listarCidadesCanais(canais, filtroUf),
    [canais, filtroUf],
  )

  const contagens = useMemo(() => {
    const c: Record<FiltroCanal, number> = {
      TODOS: canais.length,
      OFICIAIS: 0,
      TEMATICOS: 0,
      MINHAS: 0,
      ENTRAR: 0,
    }
    for (const canal of canais) {
      if (canal.canalOficial) c.OFICIAIS += 1
      else c.TEMATICOS += 1
      if (canal.souMembro) c.MINHAS += 1
      if (!canal.souMembro && !canal.pedidoPendente) c.ENTRAR += 1
    }
    return c
  }, [canais])

  const filtrados = useMemo(() => {
    const q = normalizarTexto(buscaDeferred)
    let list = canais.filter((canal) => {
      if (filtro === 'OFICIAIS' && !canal.canalOficial) return false
      if (filtro === 'TEMATICOS' && canal.canalOficial) return false
      if (filtro === 'MINHAS' && !canal.souMembro) return false
      if (filtro === 'ENTRAR' && (canal.souMembro || canal.pedidoPendente)) return false
      if (!canalCombinaUfCidade(canal, filtroUf, filtroCidade)) return false
      if (!q) return true
      const hay = normalizarTexto(
        [
          canal.nome,
          canal.descricao,
          canal.tenantNome,
          canal.cidade,
          canal.estado,
          canal.tipoUnidade ? labelTipoUnidade(canal.tipoUnidade) : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
      return hay.includes(q)
    })

    const sortKey = ordenacao
    list = [...list].sort((a, b) => {
      if (sortKey === 'proximidade' && localizacao) {
        const da = distanciaKm(localizacao, a)
        const db = distanciaKm(localizacao, b)
        if (da != null && db != null && da !== db) return da - db
        if (da != null && db == null) return -1
        if (da == null && db != null) return 1
      }
      if (sortKey === 'membros') {
        if (a.membros !== b.membros) return b.membros - a.membros
      }
      if (sortKey === 'nome') {
        return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')
      }
      return compararRelevancia(a, b, tenantAtualId)
    })

    return list
  }, [
    canais,
    filtro,
    buscaDeferred,
    ordenacao,
    localizacao,
    tenantAtualId,
    filtroUf,
    filtroCidade,
  ])

  const grupos = useMemo(
    () => agruparCanaisPorSecao(filtrados, tenantAtualId, localizacao),
    [filtrados, tenantAtualId, localizacao],
  )

  const maisProximoId = useMemo(() => {
    if (!localizacao || filtrados.length === 0) return null
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const c of filtrados) {
      const d = distanciaKm(localizacao, c)
      if (d != null && d < bestDist) {
        bestDist = d
        bestId = c.id
      }
    }
    return bestId
  }, [localizacao, filtrados])

  function pedirLocalizacao() {
    if (localizacao) {
      setLocalizacao(null)
      salvarGeo(null)
      setGeoStatus('idle')
      if (ordenacao === 'proximidade') setOrdenacao('relevancia')
      return
    }
    if (!navigator.geolocation) {
      setGeoStatus('error')
      toast.error('Geolocalização não disponível neste dispositivo.')
      return
    }
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLocalizacao(next)
        salvarGeo(next)
        setGeoStatus('idle')
        setOrdenacao('proximidade')
        toast.success('Ordenando canais por proximidade.')
      },
      () => {
        setGeoStatus('error')
        toast.error('Não foi possível obter sua localização.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function onFotoChange(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.')
      return
    }
    crop.open(file)
  }

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarCanal(id)
        setCanais((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, souMembro: true, pedidoPendente: false, membros: c.membros + 1 }
              : c,
          ),
        )
        toast.success('Inscrito no canal!')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedirEntrada(id: string) {
    startTransition(async () => {
      try {
        await pedirEntradaCanal(id)
        setCanais((prev) =>
          prev.map((c) => (c.id === id ? { ...c, pedidoPendente: true } : c)),
        )
        toast.success('Pedido enviado — aguarde a aprovação.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
      }
    })
  }

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    startTransition(async () => {
      try {
        const { id } = await criarCanalTematico(
          nome.trim(),
          descricao.trim() || undefined,
          visibilidade,
          avatarUrl.trim() || undefined,
          !privado,
        )
        toast.success('Canal criado!')
        window.location.href = linkCanalComunidade(id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível criar.')
      }
    })
  }

  const filtros: Array<{ id: FiltroCanal; label: string }> = [
    { id: 'TODOS', label: 'Todos' },
    { id: 'OFICIAIS', label: 'Oficiais' },
    { id: 'TEMATICOS', label: 'Temáticos' },
    { id: 'MINHAS', label: 'Minhas' },
    { id: 'ENTRAR', label: 'Para entrar' },
  ]

  return (
    <div className="space-y-5">
      {crop.dialog}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar canais</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, cidade ou unidade…"
              className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-9 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.35)]"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={pedirLocalizacao}
              disabled={geoStatus === 'loading'}
              aria-pressed={!!localizacao}
              title={localizacao ? 'Desativar ordenação por proximidade' : 'Ordenar por proximidade'}
              className={[
                'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-50',
                localizacao
                  ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
            >
              {geoStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{localizacao ? 'Perto de mim' : 'Proximidade'}</span>
            </button>

            {podeCriarCanal && (
              <m.button
                type="button"
                onClick={() => setCriando((v) => !v)}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[rgb(var(--color-primary))] px-3.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo canal</span>
              </m.button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filtros.map((f) => {
            const ativo = filtro === f.id
            const count = contagens[f.id]
            if (f.id !== 'TODOS' && count === 0) return null
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={ativo}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  ativo
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {f.label}
                <span
                  className={[
                    'tabular-nums',
                    ativo ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {ufsDisponiveis.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <span className="sr-only">Estado</span>
                <select
                  value={filtroUf ?? ''}
                  onChange={(e) => {
                    const next = e.target.value || null
                    setFiltroUf(next)
                    setFiltroCidade(null)
                  }}
                  className="h-8 max-w-[5.5rem] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs font-medium text-[rgb(var(--foreground))]"
                >
                  <option value="">UF</option>
                  {ufsDisponiveis.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cidadesDisponiveis.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <span className="sr-only">Cidade</span>
                <select
                  value={filtroCidade ?? ''}
                  onChange={(e) => setFiltroCidade(e.target.value || null)}
                  className="h-8 max-w-[9rem] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs font-medium text-[rgb(var(--foreground))]"
                >
                  <option value="">Cidade</option>
                  {cidadesDisponiveis.map((cidade) => (
                    <option key={cidade} value={cidade}>
                      {cidade}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="sr-only sm:not-sr-only">Ordenar</span>
              <select
                value={ordenacao}
                onChange={(e) => {
                  const next = e.target.value as OrdenacaoCanal
                  if (next === 'proximidade' && !localizacao) {
                    pedirLocalizacao()
                    return
                  }
                  setOrdenacao(next)
                }}
                className="h-8 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs font-medium text-[rgb(var(--foreground))]"
              >
                <option value="relevancia">Relevância</option>
                <option value="proximidade">Mais próximos</option>
                <option value="membros">Mais membros</option>
                <option value="nome">Nome A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {geoStatus === 'error' && !localizacao ? (
          <p className="text-xs text-[rgb(var(--color-danger))]">
            Permita a localização no navegador para ordenar por proximidade.
          </p>
        ) : null}

        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {filtrados.length === canais.length
            ? `${canais.length} ${canais.length === 1 ? 'canal' : 'canais'}`
            : `${filtrados.length} de ${canais.length} canais`}
          {localizacao ? ' · agrupados por proximidade' : null}
          {filtroUf ? ` · ${filtroUf}` : null}
          {filtroCidade ? ` · ${filtroCidade}` : null}
        </p>
      </div>

      <AnimatePresence>
        {criando && (
          <m.form
            key="criar-canal"
            onSubmit={criar}
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="card-soft space-y-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              placeholder="Nome do canal temático"
              required
              className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            />
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Descrição (opcional)"
              className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
            />
            <ImageDropZone
              label="Foto do canal (opcional)"
              busy={crop.busy || pending}
              formatsHint="JPEG, PNG ou WebP — ajuste 1:1 antes do envio"
              file={
                avatarUrl.trim()
                  ? {
                      name: 'foto-canal.jpg',
                      status: crop.busy ? 'uploading' : 'done',
                      previewUrl: avatarUrl.trim(),
                    }
                  : null
              }
              onClear={avatarUrl.trim() ? () => setAvatarUrl('') : undefined}
              onFile={onFotoChange}
            />
            <select
              value={visibilidade}
              onChange={(e) =>
                setVisibilidade(e.target.value as 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO')
              }
              className="h-10 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            >
              <option value="TENANT">Só esta torcida</option>
              <option value="HIERARQUIA">Hierarquia (sede/subsede/PDE)</option>
              <option value="ALIADOS">Hierarquia + aliados</option>
              <option value="PUBLICO">Comunidade aberta</option>
            </select>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2.5">
              <input
                type="checkbox"
                checked={privado}
                onChange={(e) => setPrivado(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  Canal privado
                </span>
                <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                  Entrada mediante pedido — um admin precisa aprovar
                </span>
              </span>
            </label>
            <button
              type="submit"
              disabled={pending || crop.busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar canal
            </button>
          </m.form>
        )}
      </AnimatePresence>

      <section className="space-y-4">
        {canais.length === 0 ? (
          <MotionEmptyState
            className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
            title="Nenhum canal visível ainda."
          />
        ) : filtrados.length === 0 ? (
          <MotionEmptyState
            className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
            title="Nenhum canal corresponde aos filtros."
            description="Tente outra busca, limpe UF/cidade ou ative a proximidade."
          />
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.secao} className="space-y-3">
              <h2 className="flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {grupo.secao === 'perto' ? <MapPin className="h-3.5 w-3.5" /> : null}
                {SECAO_CANAL_LABEL[grupo.secao]}
                <span className="font-medium normal-case tracking-normal tabular-nums">
                  {grupo.canais.length}
                </span>
              </h2>
              <m.ul
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3"
              >
                {grupo.canais.map((c) => (
                  <m.li key={c.id} variants={staggerItem} className="min-w-0">
                    <CanalCard
                      canal={c}
                      tenantAtualId={tenantAtualId}
                      distanciaKm={localizacao ? distanciaKm(localizacao, c) : null}
                      destaqueProximo={c.id === maisProximoId}
                      onEntrar={entrar}
                      onPedirEntrada={pedirEntrada}
                      pending={pending}
                    />
                  </m.li>
                ))}
              </m.ul>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function CanalCard({
  canal,
  tenantAtualId,
  distanciaKm: dist,
  destaqueProximo,
  onEntrar,
  onPedirEntrada,
  pending,
}: {
  canal: CanalItem
  tenantAtualId: string
  distanciaKm: number | null
  destaqueProximo: boolean
  onEntrar: (id: string) => void
  onPedirEntrada: (id: string) => void
  pending: boolean
}) {
  // Sempre pelo id do canal: SUBSEDE/PDE Caso A compartilham tenantId da mãe —
  // linkUnidadeComunidade apontaria todas para o mesmo mural do portal.
  const href = linkCanalComunidade(canal.id)
  const local = localizacaoLabel(canal)
  const tipoLabel = canal.tipoUnidade ? labelTipoUnidade(canal.tipoUnidade) : null
  const distLabel = dist != null ? formatarDistanciaKm(dist) : null
  const tenantNome = formatNomeTorcida(canal.tenantNome)
  const canalNome = canal.canalOficial
    ? formatNomeTorcida(canal.nome ?? tenantNome)
    : (canal.nome ?? 'Canal')
  const resumo =
    canal.descricao?.trim() ||
    (canal.canalOficial
      ? 'Canal oficial da unidade.'
      : labelVisibilidadeCanal(canal.visibilidadeCanal))

  return (
    <article
      className={[
        'card-soft flex h-full flex-col overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] transition-[border-color,box-shadow,background-color] duration-150',
        destaqueProximo
          ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.05)] shadow-sm'
          : 'border-[rgb(var(--border))] hover:border-[rgb(var(--primary)_/_0.4)] hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Link
            href={href}
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] sm:h-24 sm:w-24"
            aria-label={`Abrir canal ${canalNome}`}
          >
            {canal.avatarUrl ? (
              <LogoImage
                src={canal.avatarUrl}
                alt={canalNome}
                size={192}
                quality={95}
                className="h-20 w-20 object-contain sm:h-24 sm:w-24"
              />
            ) : (
              <Avatar nome={canalNome} avatarUrl={canal.avatarUrl} size="xl" fit="contain" />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span
                className={[
                  'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  canal.canalOficial
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {canal.canalOficial ? 'Oficial' : 'Temático'}
              </span>
              {canal.tenantId === tenantAtualId ? (
                <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  você
                </span>
              ) : null}
              {destaqueProximo ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-[rgb(var(--color-primary)_/_0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-primary-fg))]">
                  <MapPin className="h-3 w-3" aria-hidden />
                  Mais perto
                </span>
              ) : null}
            </div>

            <Link
              href={href}
              className="mt-1.5 line-clamp-2 text-sm font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))] text-balance hover:underline"
            >
              {canalNome}
            </Link>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {tipoLabel ? <span>{tipoLabel}</span> : null}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden />
                <span className="tabular-nums">
                  {canal.membros} {canal.membros === 1 ? 'membro' : 'membros'}
                </span>
              </span>
              {!canal.publica ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" aria-hidden />
                  Pedido
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))] text-pretty">
          {resumo}
        </p>

        <div className="mt-auto space-y-2">
          <div className="flex items-start justify-between gap-2">
            {local ? (
              <p className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-[rgb(var(--foreground))]">
                <MapPin
                  className="h-3 w-3 shrink-0 text-[rgb(var(--foreground-muted))]"
                  aria-hidden
                />
                <span className="truncate">{local}</span>
              </p>
            ) : nomesEquivalentes(canalNome, tenantNome) ? null : (
              <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{tenantNome}</p>
            )}
            {distLabel ? (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
                {distLabel}
              </span>
            ) : null}
          </div>

          {canal.souMembro ? (
            <Link
              href={href}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
            >
              Abrir canal
            </Link>
          ) : canal.publica ? (
            <m.button
              type="button"
              disabled={pending}
              onClick={() => onEntrar(canal.id)}
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              Entrar
            </m.button>
          ) : canal.pedidoPendente ? (
            <span className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Pedido enviado
            </span>
          ) : (
            <m.button
              type="button"
              disabled={pending}
              onClick={() => onPedirEntrada(canal.id)}
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              Solicitar
            </m.button>
          )}
        </div>
      </div>
    </article>
  )
}
