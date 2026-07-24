'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  criarSede,
  editarSede,
  alterarStatusSede,
  salvarFotoSede,
  type SedeState,
} from '@/app/admin/sedes/actions'
import { resolverCoordsDeLinkMaps } from '@/lib/maps-actions'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Link2,
  Loader2,
  MapPin,
  Power,
  PowerOff,
  Search,
  Settings2,
  Shield,
} from 'lucide-react'
import { m } from 'motion/react'
import { FieldError, Input, Select, Textarea, toast } from '@torcida/ui'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { ImageCropDialog } from '@/components/admin/image-crop-dialog'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import {
  buildGeocodeQuery,
  buildGoogleMapsUrl,
  buildStreetViewImageUrl,
  geocodeLatLng,
  isGoogleMapsConfigured,
  parseCoordsFromGoogleMapsUrl,
  reverseGeocodeEndereco,
  STREET_VIEW_DEFAULTS,
} from '@/lib/google-maps'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { isTipoSedeTravado, tiposPaiPermitidos, type TipoSede } from '@/lib/sede-regras'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { runPersistAction, submitRedirectAction } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { springSnappy } from '@/lib/motion-presets'

const SedeMapPicker = dynamic(
  () => import('@/components/admin/sede-map-picker').then((m) => m.SedeMapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]" />
    ),
  },
)

type SedeOption = { id: string; nome: string; tipo: string }

/** Pai em outro tenant (Caso B) — exibido como herança, não editável. */
export type PaiHerdado = {
  id: string
  nome: string
  tipo: string
  tenantNome: string
}

export type SedeFormData = {
  id: string
  nome: string
  tipo: string
  sedeId: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  capacidade: number | null
  responsavel: string | null
  responsavelUserId: string | null
  telefone: string | null
  horarios: string | null
  descricao: string | null
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  streetViewHeading: number | null
  streetViewPitch: number | null
  streetViewFov: number | null
  ativa: boolean
}

export type ResponsavelCandidato = {
  id: string
  nome: string | null
  email: string | null
}

const FORM_LABELS: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  sedeId: 'Sede pai',
  endereco: 'Endereço',
  cidade: 'Cidade',
  estado: 'Estado',
  cep: 'CEP',
  capacidade: 'Capacidade',
  responsavel: 'Responsável',
  responsavelUserId: 'Liderança',
  telefone: 'Telefone',
  horarios: 'Horários',
  descricao: 'Descrição',
  fotoUrl: 'Foto',
  lat: 'Latitude',
  lng: 'Longitude',
  streetViewHeading: 'Direção Street View',
  streetViewPitch: 'Inclinação Street View',
  streetViewFov: 'Zoom Street View',
}

type SedeStepId = 'identidade' | 'localizacao' | 'operacao'

const SEDE_STEPS: Array<{
  id: SedeStepId
  label: string
  short: string
  description: string
  icon: typeof Shield
  errorKeys: string[]
}> = [
  {
    id: 'identidade',
    label: 'Identidade',
    short: '1',
    description: 'Tipo, nome e hierarquia',
    icon: Shield,
    errorKeys: ['tipo', 'nome', 'sedeId'],
  },
  {
    id: 'localizacao',
    label: 'Localização',
    short: '2',
    description: 'Endereço, mapa e foto',
    icon: MapPin,
    errorKeys: [
      'endereco',
      'cidade',
      'estado',
      'cep',
      'lat',
      'lng',
      'streetViewHeading',
      'streetViewPitch',
      'streetViewFov',
      'fotoUrl',
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    short: '3',
    description: 'Liderança e detalhes',
    icon: Settings2,
    errorKeys: ['responsavel', 'responsavelUserId', 'telefone', 'capacidade', 'horarios', 'descricao'],
  },
]

function markFormDirty(formId: string) {
  const form = document.getElementById(formId) as HTMLFormElement | null
  // Após o paint: o hidden fotoUrl precisa refletir o setState antes do snapshot.
  requestAnimationFrame(() => {
    form?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Após persistir um campo no servidor, alinha o baseline do StickyPersistBar. */
function patchFormBaseline(formId: string, fields: Record<string, string>) {
  const form = document.getElementById(formId) as HTMLFormElement | null
  requestAnimationFrame(() => {
    form?.dispatchEvent(
      new CustomEvent('torcida:baseline-patch', { bubbles: true, detail: fields }),
    )
  })
}

function stepFromErrors(errors: SedeState['errors']): SedeStepId | null {
  if (!errors) return null
  for (const step of SEDE_STEPS) {
    if (step.errorKeys.some((key) => Boolean(errors[key]?.length))) return step.id
  }
  return null
}

function FieldLabel({
  children,
  required,
}: {
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  )
}

function SedeStepNav({
  step,
  onChange,
  hasCoords,
  hasErrors,
}: {
  step: SedeStepId
  onChange: (id: SedeStepId) => void
  hasCoords: boolean
  hasErrors: Partial<Record<SedeStepId, boolean>>
}) {
  const activeIndex = SEDE_STEPS.findIndex((s) => s.id === step)

  return (
    <nav aria-label="Etapas do formulário de sede" className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-3">
        {SEDE_STEPS.map((item, index) => {
          const active = item.id === step
          const done = index < activeIndex
          const Icon = item.icon
          const erro = hasErrors[item.id]
          return (
            <li key={item.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`sede-step-${item.id}`}
                id={`sede-tab-${item.id}`}
                onClick={() => onChange(item.id)}
                className={[
                  'group relative flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                  active
                    ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.1)]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.28)] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold tabular-nums',
                    active
                      ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                      : done
                        ? 'bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {done && !active ? <Check className="h-4 w-4" aria-hidden /> : item.short}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={[
                        'h-3.5 w-3.5 shrink-0',
                        active
                          ? 'text-[rgb(var(--color-primary-fg))]'
                          : 'text-[rgb(var(--foreground-muted))]',
                      ].join(' ')}
                      aria-hidden
                    />
                    <span
                      className={[
                        'truncate text-sm font-semibold',
                        active
                          ? 'text-[rgb(var(--foreground))]'
                          : 'text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]',
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                    {erro ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="Há erros nesta etapa" />
                    ) : null}
                    {item.id === 'localizacao' && !hasCoords ? (
                      <span className="ml-auto shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Mapa
                      </span>
                    ) : null}
                    {item.id === 'localizacao' && hasCoords ? (
                      <span className="ml-auto shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        OK
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                    {item.description}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div
        className="h-1 overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]"
        aria-hidden
      >
        <m.div
          className="h-full rounded-full bg-[rgb(var(--color-primary))]"
          initial={false}
          animate={{ width: `${((activeIndex + 1) / SEDE_STEPS.length) * 100}%` }}
          transition={springSnappy}
        />
      </div>
    </nav>
  )
}

function SedeStepFooter({
  step,
  onChange,
}: {
  step: SedeStepId
  onChange: (id: SedeStepId) => void
}) {
  const index = SEDE_STEPS.findIndex((s) => s.id === step)
  const prev = index > 0 ? SEDE_STEPS[index - 1] : null
  const next = index < SEDE_STEPS.length - 1 ? SEDE_STEPS[index + 1] : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-4">
      <div>
        {prev ? (
          <button
            type="button"
            onClick={() => onChange(prev.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {prev.label}
          </button>
        ) : (
          <span className="text-xs text-[rgb(var(--foreground-muted))]">Etapa 1 de 3</span>
        )}
      </div>
      <div>
        {next ? (
          <button
            type="button"
            onClick={() => onChange(next.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] px-3.5 py-2 text-sm font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.35)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.2)]"
          >
            {next.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Revise e salve quando estiver pronto
          </span>
        )}
      </div>
    </div>
  )
}

function SedeLocalizacaoFields({
  formId,
  defaults,
  state,
  onCoordsChange,
  mapVisible = true,
}: {
  formId: string
  defaults?: Partial<SedeFormData>
  state: SedeState
  onCoordsChange?: (hasCoords: boolean) => void
  /** Evita mapa com tamanho 0 quando a etapa está oculta. */
  mapVisible?: boolean
}) {
  const [lat, setLat] = useState(defaults?.lat != null ? String(defaults.lat) : '')
  const [lng, setLng] = useState(defaults?.lng != null ? String(defaults.lng) : '')
  const [fotoUrl, setFotoUrl] = useState(defaults?.fotoUrl ?? '')
  // Sede não guarda o link colado — só lat/lng. Reconstrói um link a partir
  // das coordenadas salvas pra não parecer "perdido" ao reabrir a edição.
  const [mapsLink, setMapsLink] = useState(
    defaults?.lat != null && defaults?.lng != null
      ? (buildGoogleMapsUrl({
          lat: defaults.lat,
          lng: defaults.lng,
          endereco: defaults?.endereco,
          cidade: defaults?.cidade,
          estado: defaults?.estado,
        }) ?? '')
      : '',
  )
  const [mapSearch, setMapSearch] = useState('')
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [uploading, setUploading] = useState(false)
  const [svHeading, setSvHeading] = useState(
    defaults?.streetViewHeading ?? STREET_VIEW_DEFAULTS.heading,
  )
  const [svPitch, setSvPitch] = useState(
    defaults?.streetViewPitch ?? STREET_VIEW_DEFAULTS.pitch,
  )
  const [svFov, setSvFov] = useState(defaults?.streetViewFov ?? STREET_VIEW_DEFAULTS.fov)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropTitle, setCropTitle] = useState('Ajustar foto')
  const [previewNonce, setPreviewNonce] = useState(0)
  const objectUrlRef = useRef<string | null>(null)
  const mapsConfigured = isGoogleMapsConfigured()
  const router = useRouter()
  const sedeId = defaults?.id
  const [buscandoCep, setBuscandoCep] = useState(false)
  const cepRef = useRef<HTMLInputElement>(null)
  const enderecoRef = useRef<HTMLInputElement>(null)
  const cidadeRef = useRef<HTMLInputElement>(null)
  const estadoRef = useRef<HTMLInputElement>(null)
  // Uma vez que o usuário arrasta o pin, cola um link ou busca no mapa, a posição
  // é considerada intencional — edições no endereço não devem mais empurrá-la.
  const pinManualInicial = Boolean(
    defaults?.lat != null && defaults?.lng != null && Number.isFinite(defaults.lat) && Number.isFinite(defaults.lng),
  )
  const pinManualRef = useRef(pinManualInicial)
  const [pinManual, setPinManual] = useState(pinManualInicial)
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
    }
  }, [])

  async function buscarEndereco(valorCep: string) {
    const digitos = valorCep.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const endereco = await buscarEnderecoPorCep(valorCep)
      if (!endereco) return
      // Sempre sobrescreve — um CEP novo e válido substitui o endereço
      // anterior na hora, mesmo que os campos já estivessem preenchidos.
      if (endereco.localidade && cidadeRef.current) {
        cidadeRef.current.value = endereco.localidade
        cidadeRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (endereco.uf && estadoRef.current) {
        estadoRef.current.value = endereco.uf
        estadoRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (endereco.logradouro && enderecoRef.current) {
        enderecoRef.current.value = endereco.logradouro
        enderecoRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } finally {
      setBuscandoCep(false)
    }
  }

  /** Debounce: geocodifica sozinho ao digitar endereço/cidade/estado, sem exigir clique. */
  function agendarGeocodeReativo() {
    if (pinManualRef.current || !mapsConfigured) return
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
    geocodeTimerRef.current = setTimeout(() => {
      void geocodificar({ silent: true })
    }, 700)
  }

  const latN = lat.trim() ? Number(lat) : null
  const lngN = lng.trim() ? Number(lng) : null
  const hasCoords =
    latN != null && lngN != null && Number.isFinite(latN) && Number.isFinite(lngN)

  useEffect(() => {
    onCoordsChange?.(hasCoords)
  }, [hasCoords, onCoordsChange])

  const previewSede = {
    endereco: defaults?.endereco,
    cidade: defaults?.cidade,
    estado: defaults?.estado,
    lat: hasCoords ? latN : null,
    lng: hasCoords ? lngN : null,
    fotoUrl: fotoUrl.trim() || null,
  }

  const streetViewPreview =
    mapsConfigured && hasCoords
      ? buildStreetViewImageUrl(previewSede, {
          width: 640,
          height: 360,
          heading: svHeading,
          pitch: svPitch,
          fov: svFov,
        })
      : null

  const fotoPreview = fotoUrl.trim() || null

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function openCrop(src: string, title: string) {
    if (objectUrlRef.current && objectUrlRef.current !== src) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setCropTitle(title)
    setCropSrc(src)
  }

  function closeCrop() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setCropSrc(null)
  }

  function aplicarCoords(
    coords: { lat: number; lng: number },
    origem: 'geo' | 'link' | 'search' | 'map',
  ) {
    setLat(String(coords.lat))
    setLng(String(coords.lng))
    if (origem === 'geo') setGeoStatus('ok')
    if (origem === 'link') setLinkStatus('ok')
    if (origem === 'search') setSearchStatus('ok')
    // Arrastar/colar link/buscar é posicionamento manual — endereço não move mais o pin sozinho.
    if (origem === 'map' || origem === 'link' || origem === 'search') {
      pinManualRef.current = true
      setPinManual(true)
    }
    markFormDirty(formId)
  }

  async function geocodificar(opts?: { silent?: boolean }) {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const fd = new FormData(form)
    const query = buildGeocodeQuery({
      endereco: String(fd.get('endereco') ?? ''),
      cidade: String(fd.get('cidade') ?? ''),
      estado: String(fd.get('estado') ?? ''),
    })
    if (!query) {
      setGeoStatus(opts?.silent ? 'idle' : 'error')
      return
    }
    setGeoStatus('loading')
    const coords = await geocodeLatLng(query)
    if (!coords) {
      setGeoStatus(opts?.silent ? 'idle' : 'error')
      return
    }
    aplicarCoords(coords, 'geo')
  }

  // Sobrescreve CEP/endereço/cidade/UF com o que o Maps devolve para essa
  // coordenada — o link colado passa a ser a fonte da verdade do endereço.
  function preencherEnderecoDeCoords(coords: { lat: number; lng: number }) {
    void reverseGeocodeEndereco(coords).then((endereco) => {
      if (!endereco) return
      if (endereco.endereco && enderecoRef.current) {
        enderecoRef.current.value = endereco.endereco
        enderecoRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (endereco.cidade && cidadeRef.current) {
        cidadeRef.current.value = endereco.cidade
        cidadeRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (endereco.estado && estadoRef.current) {
        estadoRef.current.value = endereco.estado
        estadoRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (endereco.cep && cepRef.current) {
        cepRef.current.value = endereco.cep
        cepRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
  }

  async function aplicarLinkMaps() {
    const raw = mapsLink.trim()
    if (!raw) {
      setLinkStatus('error')
      return
    }

    const local = parseCoordsFromGoogleMapsUrl(raw)
    if (local) {
      aplicarCoords(local, 'link')
      preencherEnderecoDeCoords(local)
      return
    }

    setLinkStatus('loading')
    const result = await resolverCoordsDeLinkMaps(raw)
    if (!result.ok) {
      setLinkStatus('error')
      toast.error(result.message)
      return
    }
    aplicarCoords({ lat: result.lat, lng: result.lng }, 'link')
    preencherEnderecoDeCoords({ lat: result.lat, lng: result.lng })
  }

  async function buscarNoMapa() {
    const q = mapSearch.trim()
    if (!q) {
      setSearchStatus('error')
      return
    }
    setSearchStatus('loading')
    const coords = await geocodeLatLng(q.includes('Brasil') ? q : `${q}, Brasil`)
    if (!coords) {
      setSearchStatus('error')
      toast.error('Não encontramos esse local. Tente outro termo ou um link do Maps.')
      return
    }
    aplicarCoords(coords, 'search')
  }

  function onImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo: 10MB.')
      return
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    openCrop(url, 'Ajustar e redimensionar foto')
  }

  async function uploadCroppedFile(file: File) {
    setUploading(true)
    try {
      const url = await toast
        .promise(uploadMediaToCloudinary(file, undefined, 'sede'), {
          loading: 'Enviando foto…',
          success: 'Foto enviada.',
          error: (err) => (err instanceof Error ? err.message : 'Falha no upload.'),
        })
        .unwrap()
      setFotoUrl(url)
      setPreviewNonce((n) => n + 1)

      // Em edição, grava na hora — o header usa Sede.fotoUrl e não espera o Salvar.
      if (sedeId) {
        const saved = await salvarFotoSede(sedeId, url)
        if (!saved.ok) {
          toast.error(saved.message)
          markFormDirty(formId)
        } else {
          patchFormBaseline(formId, { fotoUrl: url })
          router.refresh()
        }
      } else {
        markFormDirty(formId)
      }
      closeCrop()
    } catch {
      // toast.promise já notificou
    } finally {
      setUploading(false)
    }
  }

  async function limparFoto() {
    setFotoUrl('')
    setPreviewNonce((n) => n + 1)
    if (sedeId) {
      const saved = await salvarFotoSede(sedeId, null)
      if (!saved.ok) {
        toast.error(saved.message)
        markFormDirty(formId)
        return
      }
      patchFormBaseline(formId, { fotoUrl: '' })
      router.refresh()
      return
    }
    markFormDirty(formId)
  }

  return (
    <div className="space-y-5">
      {cropSrc && (
        <ImageCropDialog
          src={cropSrc}
          title={cropTitle}
          aspect={1}
          confirmLabel={uploading ? 'Enviando…' : 'Confirmar e enviar'}
          onCancel={closeCrop}
          onConfirm={uploadCroppedFile}
        />
      )}

      <div
        className={[
          'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3',
          hasCoords
            ? 'border-emerald-500/25 bg-emerald-500/8'
            : 'border-amber-500/30 bg-amber-500/10',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
            {hasCoords ? 'Pin definido no mapa' : 'Esta unidade ainda não aparece no portal'}
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {geoStatus === 'loading' && !pinManual
              ? 'Localizando endereço no mapa…'
              : hasCoords
                ? pinManual
                  ? 'Arraste o pin para ajustar. Salve para publicar no portal.'
                  : 'Digite o endereço completo (rua e número) para localizar automaticamente.'
                : 'Digite o endereço, cole um link do Maps ou busque o local.'}
          </p>
        </div>
        {mapsConfigured && (
          <button
            type="button"
            onClick={() => {
              pinManualRef.current = false
              setPinManual(false)
              void geocodificar()
            }}
            disabled={geoStatus === 'loading'}
            title={pinManual ? 'Recalcular a partir do endereço (substitui o ajuste manual do pin)' : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
          >
            {geoStatus === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            Geocodificar endereço
          </button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <div>
            <FieldLabel>
              CEP {buscandoCep && <span className="font-normal normal-case text-[rgb(var(--foreground-muted))]">(buscando…)</span>}
            </FieldLabel>
            <Input
              ref={cepRef}
              name="cep"
              type="text"
              defaultValue={defaults?.cep ?? ''}
              placeholder="00000-000"
              onChange={(e) => void buscarEndereco(e.target.value)}
              onBlur={(e) => void buscarEndereco(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Endereço</FieldLabel>
            <Input
              ref={enderecoRef}
              name="endereco"
              type="text"
              defaultValue={defaults?.endereco ?? ''}
              placeholder="Rua, número, complemento"
              onChange={agendarGeocodeReativo}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Cidade</FieldLabel>
              <Input
                ref={cidadeRef}
                name="cidade"
                type="text"
                defaultValue={defaults?.cidade ?? ''}
                placeholder="São Paulo"
                onChange={agendarGeocodeReativo}
              />
            </div>
            <div>
              <FieldLabel>Estado</FieldLabel>
              <Input
                ref={estadoRef}
                name="estado"
                type="text"
                defaultValue={defaults?.estado ?? ''}
                placeholder="SP"
                maxLength={2}
                onChange={agendarGeocodeReativo}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Fixar no mapa
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <FieldLabel>Link do Google Maps</FieldLabel>
                <Input
                  type="url"
                  value={mapsLink}
                  onChange={(e) => {
                    setMapsLink(e.target.value)
                    setLinkStatus('idle')
                  }}
                  placeholder="https://maps.app.goo.gl/… ou maps.google.com/…"
                />
              </div>
              <button
                type="button"
                onClick={() => void aplicarLinkMaps()}
                disabled={linkStatus === 'loading' || !mapsLink.trim()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
              >
                {linkStatus === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Aplicar link
              </button>
            </div>

            {mapsConfigured && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <FieldLabel>Buscar no mapa</FieldLabel>
                  <Input
                    type="search"
                    value={mapSearch}
                    onChange={(e) => {
                      setMapSearch(e.target.value)
                      setSearchStatus('idle')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void buscarNoMapa()
                      }
                    }}
                    placeholder="Ex: PDE Cubatão, SP"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void buscarNoMapa()}
                  disabled={searchStatus === 'loading' || !mapSearch.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
                >
                  {searchStatus === 'loading' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Buscar
                </button>
              </div>
            )}

            {(linkStatus === 'ok' || searchStatus === 'ok' || geoStatus === 'ok') && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Coordenadas atualizadas. Salve para publicar no mapa do portal.
              </p>
            )}
            {geoStatus === 'error' && (
              <p className="text-xs text-red-500" role="alert">
                Não foi possível geocodificar o endereço. Use o link do Maps, a busca ou lat/lng.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Latitude</FieldLabel>
              <Input
                name="lat"
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-23.5505"
              />
              <FieldError errors={state.errors?.lat} />
            </div>
            <div>
              <FieldLabel>Longitude</FieldLabel>
              <Input
                name="lng"
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-46.6333"
              />
              <FieldError errors={state.errors?.lng} />
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          {mapsConfigured ? (
            mapVisible ? (
              <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-2">
                  <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                    Mapa interativo
                  </p>
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    Clique ou arraste o pin
                  </p>
                </div>
                <SedeMapPicker
                  lat={hasCoords ? latN : null}
                  lng={hasCoords ? lngN : null}
                  onPick={(coords) => aplicarCoords(coords, 'map')}
                  className="h-72 w-full sm:h-80"
                />
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 text-sm text-[rgb(var(--foreground-muted))] sm:h-80">
                Abra a etapa Localização para o mapa
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Google Maps não configurado. Informe latitude e longitude manualmente.
            </div>
          )}
        </div>
      </div>

      {mapsConfigured && hasCoords && streetViewPreview && (
        <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 p-4">
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Street View</p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Ajuste a fachada exibida no mapa e nas listagens de unidades.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] sm:items-stretch">
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
              <Image
                src={streetViewPreview}
                alt="Prévia Street View"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 55vw"
                unoptimized
              />
            </div>
            <div className="flex flex-col gap-3">
              <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
                Direção ({svHeading}°)
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={svHeading}
                  onChange={(e) => {
                    setSvHeading(Number(e.target.value))
                    markFormDirty(formId)
                  }}
                  className="mt-1 w-full accent-[rgb(var(--primary))]"
                />
              </label>
              <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
                Inclinação ({svPitch}°)
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={svPitch}
                  onChange={(e) => {
                    setSvPitch(Number(e.target.value))
                    markFormDirty(formId)
                  }}
                  className="mt-1 w-full accent-[rgb(var(--primary))]"
                />
              </label>
              <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
                Zoom ({svFov}° FOV)
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={svFov}
                  onChange={(e) => {
                    setSvFov(Number(e.target.value))
                    markFormDirty(formId)
                  }}
                  className="mt-1 w-full accent-[rgb(var(--primary))]"
                />
              </label>
            </div>
          </div>
          <FieldError errors={state.errors?.streetViewHeading} />
          <FieldError errors={state.errors?.streetViewPitch} />
          <FieldError errors={state.errors?.streetViewFov} />
        </div>
      )}

      <input type="hidden" name="streetViewHeading" value={String(svHeading)} />
      <input type="hidden" name="streetViewPitch" value={String(svPitch)} />
      <input type="hidden" name="streetViewFov" value={String(svFov)} />

      <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] p-4">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Foto da unidade</p>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Usada no header e no avatar dos canais oficiais quando não há avatar próprio.
          </p>
        </div>
        <ImageDropZone
          layout="split"
          busy={uploading}
          onFile={onImageFile}
          formatsHint="JPEG, PNG, WebP ou GIF, até 10 MB — ajuste o enquadramento antes do envio"
          file={
            fotoPreview
              ? {
                  name: 'foto-unidade.jpg',
                  sizeLabel: undefined,
                  status: uploading ? 'uploading' : 'done',
                  previewUrl: fotoPreview,
                  previewKey: String(previewNonce),
                }
              : null
          }
          onClear={fotoPreview ? () => void limparFoto() : undefined}
        />
        <input type="hidden" name="fotoUrl" value={fotoUrl} />
        <Input
          type="url"
          value={fotoUrl}
          onChange={(e) => {
            setFotoUrl(e.target.value)
            markFormDirty(formId)
          }}
          placeholder="Ou cole a URL da imagem (https://…)"
        />
        <FieldError errors={state.errors?.fotoUrl} />
      </div>
    </div>
  )
}

function SedeIdentidadeFields({
  state,
  sedes,
  defaults,
  paiHerdado,
}: {
  state: SedeState
  sedes: SedeOption[]
  defaults?: Partial<SedeFormData>
  paiHerdado?: PaiHerdado | null
}) {
  const [tipo, setTipo] = useState<TipoSede>((defaults?.tipo as TipoSede) ?? 'PONTO_ENCONTRO')
  const hierarquiaTravada = Boolean(paiHerdado)
  const sedePrincipalTravada =
    Boolean(defaults?.id) && isTipoSedeTravado((defaults?.tipo as TipoSede) ?? tipo)
  const tipoTravado = hierarquiaTravada || sedePrincipalTravada
  const paisPermitidos = hierarquiaTravada ? null : tiposPaiPermitidos(tipo)
  const sedesPai = paisPermitidos
    ? sedes.filter((s) => paisPermitidos.includes(s.tipo as TipoSede))
    : []
  const labelTipoPai =
    paiHerdado?.tipo === 'SEDE'
      ? 'Sede'
      : paiHerdado?.tipo === 'SUBSEDE'
        ? 'Subsede'
        : 'PDE'

  const hierarquiaHint = hierarquiaTravada
    ? 'PDE afiliado à torcida principal — tipo e vínculo pai ficam fixos nesta edição.'
    : sedePrincipalTravada
      ? 'Sede principal da torcida — o tipo não pode ser alterado.'
      : 'Sede → Subsede → PDE. O tipo define quais unidades podem ser pai desta.'

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/35 px-4 py-3">
        <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Hierarquia da torcida</p>
        <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {hierarquiaHint}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>Tipo</FieldLabel>
          {tipoTravado ? (
            <>
              <input type="hidden" name="tipo" value={tipo} />
              <Select value={tipo} disabled aria-readonly="true">
                <option value="SEDE">Sede</option>
                <option value="SUBSEDE">Subsede</option>
                <option value="PONTO_ENCONTRO">PDE</option>
              </Select>
            </>
          ) : (
            <Select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoSede)}
            >
              <option value="SEDE">Sede</option>
              <option value="SUBSEDE">Subsede</option>
              <option value="PONTO_ENCONTRO">PDE</option>
            </Select>
          )}
          <FieldError errors={state.errors?.tipo} />
        </div>

        <div className="sm:col-span-2">
          <FieldLabel required>Nome</FieldLabel>
          <Input
            name="nome"
            type="text"
            defaultValue={defaults?.nome ?? ''}
            placeholder="Ex: PDE — Pinheiros"
            required
          />
          <FieldError errors={state.errors?.nome} />
        </div>
      </div>

      {paiHerdado ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.12)]">
          <input type="hidden" name="sedeId" value={paiHerdado.id} />
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Torcida principal
          </p>
          <p className="mt-1 text-base font-semibold text-[rgb(var(--foreground))]">
            {paiHerdado.tenantNome}
          </p>
          <p className="mt-3 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pertence à unidade
          </p>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground))]">
            [{labelTipoPai}] {paiHerdado.nome}
          </p>
          <p className="mt-2 text-[11px] text-[rgb(var(--foreground-muted))]">
            Vínculo herdado da afiliação/promoção. Não é possível alterar a torcida principal neste
            fluxo.
          </p>
          <FieldError errors={state.errors?.sedeId} />
        </div>
      ) : paisPermitidos === null ? (
        <input type="hidden" name="sedeId" value="" />
      ) : (
        <div>
          <FieldLabel required>Pertence à sede</FieldLabel>
          <Select name="sedeId" defaultValue={defaults?.sedeId ?? ''} required>
            <option value="">— Selecione a unidade pai —</option>
            {sedesPai.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.tipo === 'SEDE' ? 'Sede' : s.tipo === 'SUBSEDE' ? 'Subsede' : 'PDE'}] {s.nome}
              </option>
            ))}
          </Select>
          <FieldError errors={state.errors?.sedeId} />
          {sedesPai.length === 0 && (
            <p className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Cadastre uma {tipo === 'SUBSEDE' ? 'Sede' : 'Sede ou Subsede'} antes de criar este
              tipo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SedeOperacaoFields({
  state,
  candidatos,
  defaults,
}: {
  state: SedeState
  candidatos: ResponsavelCandidato[]
  defaults?: Partial<SedeFormData>
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/35 px-4 py-3">
        <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Dados operacionais</p>
        <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          Contato, capacidade e informações úteis no portal. A liderança vinculada vira owner se a
          unidade for promovida a tenant próprio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Liderança (membro)</FieldLabel>
          <Select name="responsavelUserId" defaultValue={defaults?.responsavelUserId ?? ''}>
            <option value="">Sem liderança vinculada</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ?? c.email ?? c.id}
              </option>
            ))}
          </Select>
          <FieldError errors={state.errors?.responsavelUserId} />
        </div>
        <div>
          <FieldLabel>Nome de contato (texto)</FieldLabel>
          <Input
            name="responsavel"
            type="text"
            defaultValue={defaults?.responsavel ?? ''}
            placeholder="Preenchido automaticamente se escolher liderança"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Telefone</FieldLabel>
          <Input
            name="telefone"
            type="tel"
            defaultValue={defaults?.telefone ?? ''}
            placeholder="(11) 99999-9999"
          />
        </div>
        <div>
          <FieldLabel>Capacidade (pessoas)</FieldLabel>
          <Input
            name="capacidade"
            type="number"
            min={1}
            defaultValue={defaults?.capacidade?.toString() ?? ''}
            placeholder="Ex: 500"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Horários de funcionamento</FieldLabel>
        <Input
          name="horarios"
          type="text"
          defaultValue={defaults?.horarios ?? ''}
          placeholder="Ex: Seg–Sex 10h–18h"
        />
      </div>

      <div>
        <FieldLabel>Descrição / Observações</FieldLabel>
        <Textarea
          name="descricao"
          rows={4}
          defaultValue={defaults?.descricao ?? ''}
          placeholder="Informações adicionais, regras, como chegar..."
          className="resize-none"
        />
      </div>
    </div>
  )
}

function SedeFormFields({
  formId,
  state,
  sedes,
  candidatos,
  defaults,
  paiHerdado,
  initialStep,
}: {
  formId: string
  state: SedeState
  sedes: SedeOption[]
  candidatos: ResponsavelCandidato[]
  defaults?: Partial<SedeFormData>
  paiHerdado?: PaiHerdado | null
  initialStep?: SedeStepId
}) {
  const [step, setStep] = useState<SedeStepId>(initialStep ?? 'identidade')
  const [hasCoords, setHasCoords] = useState(
    () =>
      defaults?.lat != null &&
      defaults?.lng != null &&
      Number.isFinite(defaults.lat) &&
      Number.isFinite(defaults.lng),
  )

  useEffect(() => {
    const fromErrors = stepFromErrors(state.errors)
    if (fromErrors) setStep(fromErrors)
  }, [state.errors])

  const hasErrors: Partial<Record<SedeStepId, boolean>> = {}
  for (const s of SEDE_STEPS) {
    hasErrors[s.id] = s.errorKeys.some((key) => Boolean(state.errors?.[key]?.length))
  }

  const activeMeta = SEDE_STEPS.find((s) => s.id === step)!

  return (
    <>
      {state.message && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <SedeStepNav
        step={step}
        onChange={setStep}
        hasCoords={hasCoords}
        hasErrors={hasErrors}
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3 border-b border-[rgb(var(--border))] pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <activeMeta.icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
              {activeMeta.label}
            </h2>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {activeMeta.description}
            </p>
          </div>
        </div>

        {/*
          Todas as etapas ficam montadas (só ocultas) para FormData incluir
          nome/tipo/coords/etc. ao salvar de qualquer passo.
        */}
        <div
          id="sede-step-identidade"
          role="tabpanel"
          aria-labelledby="sede-tab-identidade"
          hidden={step !== 'identidade'}
          className={step === 'identidade' ? 'block' : 'hidden'}
        >
          <SedeIdentidadeFields
            state={state}
            sedes={sedes}
            defaults={defaults}
            paiHerdado={paiHerdado}
          />
        </div>

        <div
          id="sede-step-localizacao"
          role="tabpanel"
          aria-labelledby="sede-tab-localizacao"
          hidden={step !== 'localizacao'}
          className={step === 'localizacao' ? 'block' : 'hidden'}
        >
          <SedeLocalizacaoFields
            formId={formId}
            defaults={defaults}
            state={state}
            onCoordsChange={setHasCoords}
            mapVisible={step === 'localizacao'}
          />
        </div>

        <div
          id="sede-step-operacao"
          role="tabpanel"
          aria-labelledby="sede-tab-operacao"
          hidden={step !== 'operacao'}
          className={step === 'operacao' ? 'block' : 'hidden'}
        >
          <SedeOperacaoFields state={state} candidatos={candidatos} defaults={defaults} />
        </div>

        <div className="mt-6">
          <SedeStepFooter step={step} onChange={setStep} />
        </div>
      </div>
    </>
  )
}

/* ── Criar ────────────────────────────────────────────────────────────────── */
export function CriarSedeForm({
  sedes,
  candidatos,
  onCancel,
}: {
  sedes: SedeOption[]
  candidatos: ResponsavelCandidato[]
  onCancel?: () => void
}) {
  const formId = useId()
  const [state, setState] = useState<SedeState>({})
  const [pending, startTransition] = useTransition()
  const { formRef, isDirty, changes } = useTrackedForm({
    title: 'Nova sede',
    labels: FORM_LABELS,
  })

  return (
    <form
      id={formId}
      ref={formRef}
      data-persist-bar-root=""
      action={(fd) => {
        startTransition(async () => {
          await submitRedirectAction(() => criarSede({}, fd), setState, {
            success: 'Sede criada.',
          })
        })
      }}
      className="space-y-5"
    >
      <SedeFormFields formId={formId} state={state} sedes={sedes} candidatos={candidatos} />
      <StickyPersistBar
        locked={pending || isDirty}
        dirtyLabel={
          isDirty ? (changes.length === 1 ? changes[0] : `${changes.length} campos alterados`) : undefined
        }
        hint="Preencha as etapas e confirme a criação."
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Criando…' : 'Criar sede'}
        </button>
      </StickyPersistBar>
    </form>
  )
}

/* ── Editar ───────────────────────────────────────────────────────────────── */
export function EditarSedeForm({
  sede,
  sedes,
  candidatos,
  paiHerdado = null,
}: {
  sede: SedeFormData
  sedes: SedeOption[]
  candidatos: ResponsavelCandidato[]
  paiHerdado?: PaiHerdado | null
}) {
  const formId = useId()
  const [state, setState] = useState<SedeState>({})
  const [pending, startTransition] = useTransition()
  const { formRef, isDirty, changes } = useTrackedForm({
    id: `editar-sede-${sede.id}`,
    title: 'Editar sede',
    labels: FORM_LABELS,
  })
  const semCoords = sede.lat == null || sede.lng == null

  return (
    <form
      id={formId}
      ref={formRef}
      data-persist-bar-root=""
      action={(fd) => {
        startTransition(async () => {
          await submitRedirectAction(() => editarSede(sede.id, {}, fd), setState, {
            success: 'Sede atualizada.',
          })
        })
      }}
      className="space-y-5"
    >
      <SedeFormFields
        formId={formId}
        state={state}
        sedes={sedes.filter((s) => s.id !== sede.id)}
        candidatos={candidatos}
        defaults={sede}
        paiHerdado={paiHerdado}
        initialStep={semCoords ? 'localizacao' : 'identidade'}
      />
      <StickyPersistBar
        locked={pending || isDirty}
        dirtyLabel={
          isDirty ? (changes.length === 1 ? changes[0] : `${changes.length} campos alterados`) : undefined
        }
        hint="Salve para publicar no portal e no mapa."
      >
        <Link
          href="/admin/sedes"
          className="rounded-xl border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </StickyPersistBar>
    </form>
  )
}

/* ── Toggle status ─────────────────────────────────────────────────────────── */
export function ToggleSedeButton({ sedeId, ativa }: { sedeId: string; ativa: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await runPersistAction(() => alterarStatusSede(sedeId, !ativa), {
            success: ativa ? 'Sede desativada.' : 'Sede ativada.',
          })
        })
      }
      disabled={pending}
      className={[
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        ativa
          ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950',
      ].join(' ')}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : ativa ? (
        <PowerOff className="h-3.5 w-3.5" />
      ) : (
        <Power className="h-3.5 w-3.5" />
      )}
      {ativa ? 'Desativar' : 'Ativar'}
    </button>
  )
}
