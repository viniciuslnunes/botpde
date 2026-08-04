'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Check, Loader2, MapPin, Pencil, Phone, Rocket, X } from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { Badge, type BadgeVariant } from '@torcida/ui'
import {
  aprovarSolicitacao,
  criarSolicitacaoManual,
  editarSolicitacao,
  recusarSolicitacao,
  type SolicitacaoActionState,
} from '@/app/admin/(estrutura)/afiliacoes/afiliacao-actions'
import type { StatusExibicaoSolicitacao } from '@/lib/afiliacao-unidade'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { normalizarInicioEndereco } from '@/lib/endereco'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { buildGoogleMapsUrl } from '@/lib/google-maps'
import { springSnappy } from '@/lib/motion-presets'
import { MotionTabBar } from '@/components/motion/motion-tab-bar'
import { ImageCropDialog } from '@/components/admin/image-crop-dialog'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { LocationPickerFields } from '@/components/media/location-picker-fields'
import { promoverUnidadeAPortal, type PromoverState } from './promover-actions'
import { SearchableSelect, type ComboOption } from './searchable-select'

export interface SolicitacaoView {
  id: string
  /** Derivado na leitura — `REMOVIDA` = foi aprovada e a unidade excluída depois. */
  status: StatusExibicaoSolicitacao
  torcidaNome: string
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  contatoNome: string | null
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  observacao: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: string
  /** Sede criada ao aprovar (null enquanto PENDENTE/RECUSADA). */
  sedeId: string | null
  /** true = já virou portal próprio (tenant dedicado). */
  promovida: boolean
}

export interface TorcidaOption {
  id: string
  nome: string
  clubeNome: string | null
}

const TIPO_LABEL: Record<SolicitacaoView['tipo'], string> = {
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const STATUS_VARIANT: Record<SolicitacaoView['status'], BadgeVariant> = {
  PENDENTE: 'warning',
  APROVADA: 'success',
  RECUSADA: 'neutral',
  REMOVIDA: 'neutral',
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]'

const INPUT_CLASS_SM =
  'rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]'

function Feedback({ state }: { state: SolicitacaoActionState }) {
  if (!state.message) return null
  return (
    <p
      className={state.success ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}
      role={state.success ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  )
}

const CAMPOS_MANUAL_INICIAIS = {
  nome: '',
  cidade: '',
  estado: '',
  endereco: '',
  contatoNome: '',
  contatoEmail: '',
  cep: '',
}

function CriarManualForm({
  torcidas,
  onCriado,
}: {
  torcidas: TorcidaOption[]
  onCriado?: () => void
}) {
  const [state, action, pending] = useActionState<SolicitacaoActionState, FormData>(
    criarSolicitacaoManual,
    {},
  )
  const formId = useId()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [campos, setCampos] = useState(CAMPOS_MANUAL_INICIAIS)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [fotoUrl, setFotoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [erroFoto, setErroFoto] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const torcidaOptions: ComboOption[] = torcidas.map((t) => ({
    id: t.id,
    label: t.nome,
    sublabel: t.clubeNome ?? undefined,
  }))

  // Só reseta o form no sucesso — em erro de validação os campos controlados
  // devem permanecer (React 19 requestFormReset limparia inputs uncontrolled).
  useEffect(() => {
    if (state.success) {
      setCampos(CAMPOS_MANUAL_INICIAIS)
      setTenantId(null)
      setFotoUrl('')
      setErroFoto(null)
      onCriado?.()
    }
  }, [state.success, onCriado])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function setCampo(name: keyof typeof CAMPOS_MANUAL_INICIAIS, value: string) {
    setCampos((prev) => ({ ...prev, [name]: value }))
  }

  async function onCepChange(value: string) {
    setCampo('cep', value)
    const digitos = value.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const endereco = await buscarEnderecoPorCep(value)
      if (!endereco) return
      setCampos((prev) => {
        const atual = prev.endereco.trim()
        const numero = atual.match(/,?\s*(\d+[A-Za-z]?.*)$/)
        const mesmoLogradouro =
          atual.length > 0 &&
          Boolean(endereco.logradouro) &&
          normalizarInicioEndereco(atual) === normalizarInicioEndereco(endereco.logradouro)
        const novoEndereco = endereco.logradouro
          ? mesmoLogradouro && numero
            ? `${endereco.logradouro}, ${numero[1].replace(/^,\s*/, '')}`
            : endereco.logradouro
          : prev.endereco
        return {
          ...prev,
          cidade: endereco.localidade || prev.cidade,
          estado: endereco.uf || prev.estado,
          endereco: novoEndereco,
          cep: `${digitos.slice(0, 5)}-${digitos.slice(5)}`,
        }
      })
    } finally {
      setBuscandoCep(false)
    }
  }

  function onImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setErroFoto('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErroFoto('Imagem muito grande. Máximo: 10MB.')
      return
    }
    setErroFoto(null)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setCropSrc(url)
  }

  function closeCrop() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setCropSrc(null)
  }

  async function uploadCroppedFile(file: File) {
    setUploading(true)
    setErroFoto(null)
    try {
      const url = await uploadMediaToCloudinary(file, undefined, 'sede')
      setFotoUrl(url)
      closeCrop()
    } catch (err) {
      setErroFoto(err instanceof Error ? err.message : 'Falha ao subir a foto.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      id={formId}
      action={action}
      className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
        Registrar solicitação (intake manual)
      </h2>

      <input type="hidden" name="tenantId" value={tenantId ?? ''} />
      <input type="hidden" name="fotoUrl" value={fotoUrl} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Torcida principal (Sede)
          </label>
          <SearchableSelect
            options={torcidaOptions}
            value={tenantId}
            onChange={setTenantId}
            placeholder="Buscar torcida por nome…"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Foto da unidade (opcional)
          </label>
          {cropSrc && (
            <ImageCropDialog
              src={cropSrc}
              title="Ajustar e redimensionar foto"
              aspect={1}
              confirmLabel={uploading ? 'Enviando…' : 'Confirmar e enviar'}
              onCancel={closeCrop}
              onConfirm={uploadCroppedFile}
            />
          )}
          <ImageDropZone
            layout="split"
            busy={uploading}
            onFile={onImageFile}
            formatsHint="JPEG, PNG, WebP ou GIF, até 10 MB — ajuste o enquadramento antes do envio"
            file={
              fotoUrl
                ? {
                    name: 'foto-unidade.jpg',
                    status: uploading ? 'uploading' : 'done',
                    previewUrl: fotoUrl,
                  }
                : null
            }
            onClear={fotoUrl ? () => setFotoUrl('') : undefined}
          />
          {erroFoto && <p className="text-xs text-red-400">{erroFoto}</p>}
        </div>
        <Campo
          name="nome"
          label="Nome da unidade"
          placeholder="Ex.: Gaviões Praia Grande"
          value={campos.nome}
          onChange={(v) => setCampo('nome', v)}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Tipo</label>
          <select name="tipo" defaultValue="PONTO_ENCONTRO" className={INPUT_CLASS}>
            <option value="PONTO_ENCONTRO">Ponto de encontro / PDE</option>
            <option value="SUBSEDE">Subsede</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
            CEP {buscandoCep ? '· buscando…' : ''}
          </label>
          <input
            name="cep"
            value={campos.cep}
            onChange={(e) => void onCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
            className={INPUT_CLASS}
          />
        </div>
        <Campo
          name="cidade"
          label="Cidade"
          placeholder="Cidade"
          value={campos.cidade}
          onChange={(v) => setCampo('cidade', v)}
        />
        <Campo
          name="estado"
          label="UF"
          placeholder="SP"
          maxLength={2}
          value={campos.estado}
          onChange={(v) => setCampo('estado', v)}
        />
        <Campo
          name="endereco"
          label="Endereço"
          placeholder="Rua, nº, bairro"
          value={campos.endereco}
          onChange={(v) => setCampo('endereco', v)}
          wide
        />
        <LocationPickerFields
          key={state.success ? 'reset' : 'form'}
          formId={formId}
          className="sm:col-span-2"
        />
        <Campo
          name="contatoNome"
          label="Contato (liderança) — opcional, pode preencher depois"
          placeholder="Nome do responsável (opcional)"
          value={campos.contatoNome}
          onChange={(v) => setCampo('contatoNome', v)}
        />
        <Campo
          name="contatoEmail"
          label="E-mail da liderança — opcional, vincula a conta se já existir"
          placeholder="lideranca@email.com (opcional)"
          type="email"
          value={campos.contatoEmail}
          onChange={(v) => setCampo('contatoEmail', v)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading || !tenantId || !campos.cep.trim() || !campos.endereco.trim()}
          className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Registrar
        </button>
        <Feedback state={state} />
      </div>
    </form>
  )
}

function Campo({
  name,
  label,
  placeholder,
  maxLength,
  wide,
  type = 'text',
  value,
  onChange,
}: {
  name: string
  label: string
  placeholder: string
  maxLength?: number
  wide?: boolean
  type?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </div>
  )
}

function PromoverForm({ sedeId }: { sedeId: string }) {
  const [state, action, pending] = useActionState<PromoverState, FormData>(
    promoverUnidadeAPortal,
    {},
  )
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-primary-fg))]/40 px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary))]/10"
      >
        <Rocket className="h-3.5 w-3.5" />
        Promover a portal
      </button>
    )
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="sedeId" value={sedeId} />
      <input
        name="ownerEmail"
        type="email"
        placeholder="E-mail do owner (opcional)"
        className={`w-56 ${INPUT_CLASS_SM}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
        Promover
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        Cancelar
      </button>
      {state.message && (
        <span className={state.success ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
          {state.message}
        </span>
      )}
    </form>
  )
}

function ClampComTexto({ label, texto }: { label: string; texto: string }) {
  const [expandido, setExpandido] = useState(false)

  return (
    <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
      <span className="font-medium">{label}:</span>{' '}
      <span className={expandido ? '' : 'line-clamp-2'}>{texto}</span>{' '}
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
      >
        {expandido ? 'ver menos' : 'ver mais'}
      </button>
    </p>
  )
}

function SolicitacaoCard({ s }: { s: SolicitacaoView }) {
  const [aprovarState, aprovarAction, aprovando] = useActionState<SolicitacaoActionState, FormData>(
    aprovarSolicitacao,
    {},
  )
  const [recusarState, recusarAction, recusando] = useActionState<SolicitacaoActionState, FormData>(
    recusarSolicitacao,
    {},
  )
  const [editarState, editarAction, editando] = useActionState<SolicitacaoActionState, FormData>(
    editarSolicitacao,
    {},
  )
  const [modo, setModo] = useState<'ver' | 'recusar' | 'editar'>('ver')

  const ocupado = aprovando || recusando || editando
  const pendente = s.status === 'PENDENTE'

  return (
    <li className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {s.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
              {s.nome}
              <span className="ml-1.5 rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
                {TIPO_LABEL[s.tipo]}
              </span>
            </p>
            <p className="badge-primary mt-1.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
              → {s.torcidaNome}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {s.cidade}/{s.estado}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {s.contatoNome ?? 'Sem liderança definida'}
                {s.contatoTelefone ? ` · ${s.contatoTelefone}` : ''}
                {s.contatoEmail ? ` · ${s.contatoEmail}` : ''}
              </span>
              {s.lat != null && s.lng != null && (
                <a
                  href={
                    buildGoogleMapsUrl({
                      lat: s.lat,
                      lng: s.lng,
                      endereco: s.endereco ?? undefined,
                      cidade: s.cidade,
                      estado: s.estado,
                    }) ?? undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[rgb(var(--color-primary-fg))] hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  Ver no mapa
                </a>
              )}
            </p>
            {s.vinculo && <ClampComTexto label="Credenciamento" texto={s.vinculo} />}
            {s.provasUrls.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                {s.provasUrls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    prova {i + 1}
                  </a>
                ))}
              </p>
            )}
            {s.motivo && <ClampComTexto label="Motivo" texto={s.motivo} />}
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[s.status]} className="shrink-0">
          {s.status}
        </Badge>
      </div>

      {s.status === 'APROVADA' &&
        (s.promovida ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <Rocket className="h-3.5 w-3.5" />
            Portal próprio ativo
          </p>
        ) : s.sedeId ? (
          <PromoverForm sedeId={s.sedeId} />
        ) : null)}

      {pendente && modo === 'ver' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={aprovarAction}>
            <input type="hidden" name="solicitacaoId" value={s.id} />
            <button
              type="submit"
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {aprovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aprovar e promover a portal
            </button>
          </form>
          <button
            type="button"
            onClick={() => setModo('editar')}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setModo('recusar')}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Recusar
          </button>
        </div>
      )}

      {pendente && modo === 'recusar' && (
        <form action={recusarAction} className="mt-2 flex items-center gap-1.5">
          <input type="hidden" name="solicitacaoId" value={s.id} />
          <input
            name="motivo"
            required
            minLength={3}
            maxLength={500}
            placeholder="Motivo da recusa"
            className={`w-52 ${INPUT_CLASS_SM} focus:border-red-500`}
          />
          <button
            type="submit"
            disabled={ocupado}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirmar recusa
          </button>
          <button
            type="button"
            onClick={() => setModo('ver')}
            className="text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            Cancelar
          </button>
        </form>
      )}

      {pendente && modo === 'editar' && (
        <form action={editarAction} className="mt-2 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="solicitacaoId" value={s.id} />
          <input
            name="nome"
            defaultValue={s.nome}
            required
            minLength={3}
            maxLength={100}
            className={INPUT_CLASS_SM}
          />
          <select name="tipo" defaultValue={s.tipo} className={INPUT_CLASS_SM}>
            <option value="PONTO_ENCONTRO">PDE</option>
            <option value="SUBSEDE">Subsede</option>
          </select>
          <input name="cidade" defaultValue={s.cidade} required className={INPUT_CLASS_SM} />
          <input
            name="estado"
            defaultValue={s.estado}
            required
            maxLength={2}
            className={INPUT_CLASS_SM}
          />
          <input
            name="endereco"
            defaultValue={s.endereco ?? ''}
            placeholder="Endereço (opcional)"
            className={`sm:col-span-2 ${INPUT_CLASS_SM}`}
          />
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={ocupado}
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setModo('ver')}
              className="text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-1 space-y-0.5">
        <Feedback state={aprovarState} />
        <Feedback state={recusarState} />
        <Feedback state={editarState} />
      </div>
    </li>
  )
}

type FiltroStatus = 'TODAS' | StatusExibicaoSolicitacao

const FILTRO_LABEL: Record<FiltroStatus, string> = {
  TODAS: 'Todas',
  PENDENTE: 'Pendentes',
  APROVADA: 'Aprovadas',
  RECUSADA: 'Recusadas',
  REMOVIDA: 'Removidas',
}

function GerenciarSolicitacoes({ solicitacoes }: { solicitacoes: SolicitacaoView[] }) {
  const [filtro, setFiltro] = useState<FiltroStatus>('TODAS')

  const filtros: { id: FiltroStatus; count: number }[] = (
    ['TODAS', 'PENDENTE', 'APROVADA', 'RECUSADA', 'REMOVIDA'] as FiltroStatus[]
  ).map((id) => ({
    id,
    count: id === 'TODAS' ? solicitacoes.length : solicitacoes.filter((s) => s.status === id).length,
  }))

  const solicitacoesFiltradas =
    filtro === 'TODAS' ? solicitacoes : solicitacoes.filter((s) => s.status === filtro)

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Solicitações de unidade</h2>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar solicitações">
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
                {FILTRO_LABEL[f.id]}
                <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'opacity-70'}`}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {solicitacoesFiltradas.length === 0 ? (
        <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
          {solicitacoes.length === 0
            ? 'Nenhuma solicitação. Elas chegam do onboarding (“Solicitar cadastro de unidade”) ou pela aba Registrar.'
            : 'Nenhuma solicitação neste filtro.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {solicitacoesFiltradas.map((s) => (
            <SolicitacaoCard key={s.id} s={s} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function AfiliacoesConsole({
  solicitacoes,
  torcidas,
}: {
  solicitacoes: SolicitacaoView[]
  torcidas: TorcidaOption[]
}) {
  const [aba, setAba] = useState<'registrar' | 'gerenciar'>('gerenciar')
  const pendentes = solicitacoes.filter((s) => s.status === 'PENDENTE').length

  return (
    <div className="space-y-4">
      <MotionTabBar
        items={[
          { id: 'registrar', label: 'Registrar' },
          { id: 'gerenciar', label: 'Solicitações', count: pendentes },
        ]}
        activeId={aba}
        onTabChange={(id) => setAba(id as 'registrar' | 'gerenciar')}
        layoutId="afiliacoes-tab-indicator"
      />

      <AnimatePresence mode="wait">
        {aba === 'registrar' ? (
          <m.div
            key="registrar"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
          >
            <CriarManualForm torcidas={torcidas} onCriado={() => setAba('gerenciar')} />
          </m.div>
        ) : (
          <m.div
            key="gerenciar"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
          >
            <GerenciarSolicitacoes solicitacoes={solicitacoes} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
