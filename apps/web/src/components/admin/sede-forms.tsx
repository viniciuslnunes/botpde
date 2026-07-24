'use client'

import { useId, useRef, useState, useTransition, type ChangeEvent } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import {
  criarSede,
  editarSede,
  alterarStatusSede,
  resolverCoordsDeLinkMaps,
  type SedeState,
} from '@/app/admin/sedes/actions'
import {
  Crosshair,
  ImagePlus,
  Link2,
  Loader2,
  MapPin,
  Power,
  PowerOff,
  Search,
} from 'lucide-react'
import { FieldError, Input, Select, Textarea, toast } from '@torcida/ui'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import {
  buildGeocodeQuery,
  buildStreetViewImageUrl,
  geocodeLatLng,
  isGoogleMapsConfigured,
  parseCoordsFromGoogleMapsUrl,
} from '@/lib/google-maps'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { tiposPaiPermitidos, type TipoSede } from '@/lib/sede-regras'
import { runPersistAction, submitRedirectAction } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

const SedeMapPicker = dynamic(
  () => import('@/components/admin/sede-map-picker').then((m) => m.SedeMapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-52 w-full animate-pulse rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]" />
    ),
  },
)

type SedeOption = { id: string; nome: string; tipo: string }

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
}

function markFormDirty(formId: string) {
  const form = document.getElementById(formId) as HTMLFormElement | null
  form?.dispatchEvent(new Event('input', { bubbles: true }))
}

function SedeLocalizacaoFields({
  formId,
  defaults,
  state,
}: {
  formId: string
  defaults?: Partial<SedeFormData>
  state: SedeState
}) {
  const [lat, setLat] = useState(defaults?.lat != null ? String(defaults.lat) : '')
  const [lng, setLng] = useState(defaults?.lng != null ? String(defaults.lng) : '')
  const [fotoUrl, setFotoUrl] = useState(defaults?.fotoUrl ?? '')
  const [mapsLink, setMapsLink] = useState('')
  const [mapSearch, setMapSearch] = useState('')
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const mapsConfigured = isGoogleMapsConfigured()

  const latN = lat.trim() ? Number(lat) : null
  const lngN = lng.trim() ? Number(lng) : null
  const hasCoords =
    latN != null && lngN != null && Number.isFinite(latN) && Number.isFinite(lngN)

  const previewSede = {
    endereco: defaults?.endereco,
    cidade: defaults?.cidade,
    estado: defaults?.estado,
    lat: hasCoords ? latN : null,
    lng: hasCoords ? lngN : null,
    fotoUrl: fotoUrl.trim() || null,
  }

  const streetViewUrl =
    previewSede.fotoUrl ??
    (mapsConfigured
      ? buildStreetViewImageUrl(previewSede, { width: 640, height: 280 })
      : null)

  function aplicarCoords(
    coords: { lat: number; lng: number },
    origem: 'geo' | 'link' | 'search' | 'map',
  ) {
    setLat(String(coords.lat))
    setLng(String(coords.lng))
    if (origem === 'geo') setGeoStatus('ok')
    if (origem === 'link') setLinkStatus('ok')
    if (origem === 'search') setSearchStatus('ok')
    markFormDirty(formId)
  }

  async function geocodificar() {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const fd = new FormData(form)
    const query = buildGeocodeQuery({
      endereco: String(fd.get('endereco') ?? ''),
      cidade: String(fd.get('cidade') ?? ''),
      estado: String(fd.get('estado') ?? ''),
    })
    if (!query) {
      setGeoStatus('error')
      return
    }
    setGeoStatus('loading')
    const coords = await geocodeLatLng(query)
    if (!coords) {
      setGeoStatus('error')
      return
    }
    aplicarCoords(coords, 'geo')
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

  async function onFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo: 10MB.')
      return
    }

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
      markFormDirty(formId)
    } catch {
      // toast.promise já notificou
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MapPin className="h-3.5 w-3.5" />
          Localização
        </h3>
        {mapsConfigured && (
          <button
            type="button"
            onClick={() => void geocodificar()}
            disabled={geoStatus === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
          >
            {geoStatus === 'loading' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Crosshair className="h-3 w-3" />
            )}
            Geocodificar endereço
          </button>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Endereço
        </label>
        <Input
          name="endereco"
          type="text"
          defaultValue={defaults?.endereco ?? ''}
          placeholder="Rua, número, complemento"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            CEP
          </label>
          <Input name="cep" type="text" defaultValue={defaults?.cep ?? ''} placeholder="00000-000" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Cidade
          </label>
          <Input
            name="cidade"
            type="text"
            defaultValue={defaults?.cidade ?? ''}
            placeholder="São Paulo"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Estado
          </label>
          <Input
            name="estado"
            type="text"
            defaultValue={defaults?.estado ?? ''}
            placeholder="SP"
            maxLength={2}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 p-3">
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Defina o pin no mapa: cole um link do Google Maps, busque o local ou clique no mapa.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Link do Google Maps
            </label>
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
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
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
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Buscar no mapa
              </label>
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
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Latitude
          </label>
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
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Longitude
          </label>
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

      {mapsConfigured && (
        <SedeMapPicker
          lat={hasCoords ? latN : null}
          lng={hasCoords ? lngN : null}
          onPick={(coords) => aplicarCoords(coords, 'map')}
          className="h-52 w-full"
        />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Foto (opcional)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {uploading ? 'Enviando…' : 'Enviar foto'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onFileSelect}
          />
          <div className="min-w-0 flex-1">
            <Input
              name="fotoUrl"
              type="url"
              value={fotoUrl}
              onChange={(e) => setFotoUrl(e.target.value)}
              placeholder="Ou cole a URL da imagem (https://…)"
            />
            <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
              Prefira enviar a foto. Se vazio, o portal usa Street View quando o Maps estiver
              configurado.
            </p>
          </div>
        </div>
        <FieldError errors={state.errors?.fotoUrl} />
      </div>

      {streetViewUrl && (
        <div className="relative aspect-[16/9] max-w-md overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
          <Image
            src={streetViewUrl}
            alt="Prévia da fachada"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 28rem"
            unoptimized
          />
        </div>
      )}
    </div>
  )
}

function SedeFormFields({
  formId,
  state,
  sedes,
  candidatos,
  defaults,
}: {
  formId: string
  state: SedeState
  sedes: SedeOption[]
  candidatos: ResponsavelCandidato[]
  defaults?: Partial<SedeFormData>
}) {
  const [tipo, setTipo] = useState<TipoSede>((defaults?.tipo as TipoSede) ?? 'PONTO_ENCONTRO')
  const paisPermitidos = tiposPaiPermitidos(tipo)
  const sedesPai = paisPermitidos
    ? sedes.filter((s) => paisPermitidos.includes(s.tipo as TipoSede))
    : []

  return (
    <>
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Tipo <span className="text-red-500">*</span>
          </label>
          <Select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoSede)}
          >
            <option value="SEDE">Sede</option>
            <option value="SUBSEDE">Subsede</option>
            <option value="PONTO_ENCONTRO">PDE</option>
          </Select>
          <FieldError errors={state.errors?.tipo} />
          <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
            Hierarquia: Sede → Subsede → PDE
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Nome <span className="text-red-500">*</span>
          </label>
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

      {paisPermitidos === null ? (
        <input type="hidden" name="sedeId" value="" />
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pertence à sede <span className="text-red-500">*</span>
          </label>
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
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Cadastre uma {tipo === 'SUBSEDE' ? 'Sede' : 'Sede ou Subsede'} antes de criar este tipo.
            </p>
          )}
        </div>
      )}

      <SedeLocalizacaoFields formId={formId} defaults={defaults} state={state} />

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Informações operacionais
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Liderança (membro)
            </label>
            <Select name="responsavelUserId" defaultValue={defaults?.responsavelUserId ?? ''}>
              <option value="">Sem liderança vinculada</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ?? c.email ?? c.id}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
              Usado como owner ao promover a unidade a tenant próprio.
            </p>
            <FieldError errors={state.errors?.responsavelUserId} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Nome de contato (texto)
            </label>
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
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Telefone
            </label>
            <Input
              name="telefone"
              type="tel"
              defaultValue={defaults?.telefone ?? ''}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Capacidade (pessoas)
            </label>
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
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Horários de funcionamento
          </label>
          <Input
            name="horarios"
            type="text"
            defaultValue={defaults?.horarios ?? ''}
            placeholder="Ex: Seg–Sex 10h–18h"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Descrição / Observações
          </label>
          <Textarea
            name="descricao"
            rows={3}
            defaultValue={defaults?.descricao ?? ''}
            placeholder="Informações adicionais, regras, como chegar..."
            className="resize-none"
          />
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
        hint="Preencha os dados e confirme a criação."
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
}: {
  sede: SedeFormData
  sedes: SedeOption[]
  candidatos: ResponsavelCandidato[]
}) {
  const formId = useId()
  const [state, setState] = useState<SedeState>({})
  const [pending, startTransition] = useTransition()
  const { formRef, isDirty, changes } = useTrackedForm({
    id: `editar-sede-${sede.id}`,
    title: 'Editar sede',
    labels: FORM_LABELS,
  })

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
