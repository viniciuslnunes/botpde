'use client'

import { useActionState, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Rocket } from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { criarSolicitacaoManual, type SolicitacaoActionState } from '@/app/admin/(estrutura)/afiliacoes/afiliacao-actions'
import {
  AfiliacaoPedidoCard,
  type SolicitacaoView as PedidoView,
} from '@/app/admin/(estrutura)/afiliacoes/_components/afiliacao-pedido-card'
import type { StatusExibicaoSolicitacao } from '@/lib/afiliacao-unidade'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { normalizarInicioEndereco } from '@/lib/endereco'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { springSnappy } from '@/lib/motion-presets'
import { MotionTabBar } from '@/components/motion/motion-tab-bar'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ImageCropDialog } from '@/components/admin/image-crop-dialog'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { LocationPickerFields } from '@/components/media/location-picker-fields'
import { promoverUnidadeAPortal, type PromoverState } from './promover-actions'
import { SearchableSelect, type ComboOption } from './searchable-select'

/**
 * Mesma view do card do admin (`/admin/afiliacoes`) + o que só o Super Admin
 * enxerga: a torcida dona do pedido e o estado de promoção a portal próprio.
 */
export interface SolicitacaoView extends PedidoView {
  torcidaNome: string
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

/** Estado de portal próprio da unidade aprovada — rodapé do card (null = sem rodapé). */
function promocaoNode(s: SolicitacaoView): ReactNode {
  if (s.status !== 'APROVADA') return null
  if (s.promovida) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-success-fg))]">
        <Rocket className="h-3.5 w-3.5" />
        Portal próprio ativo
      </p>
    )
  }
  if (!s.sedeId) return null
  return <PromoverForm sedeId={s.sedeId} />
}

type FiltroStatus = StatusExibicaoSolicitacao

const ORDEM_FILTROS: FiltroStatus[] = ['PENDENTE', 'APROVADA', 'RECUSADA', 'REMOVIDA']

const FILTRO_LABEL: Record<FiltroStatus, string> = {
  PENDENTE: 'Pendentes',
  APROVADA: 'Aprovadas',
  RECUSADA: 'Recusadas',
  REMOVIDA: 'Removidas',
}

function GerenciarSolicitacoes({ solicitacoes }: { solicitacoes: SolicitacaoView[] }) {
  const [filtro, setFiltro] = useState<FiltroStatus>(
    () => ORDEM_FILTROS.find((s) => solicitacoes.some((x) => x.status === s)) ?? 'PENDENTE',
  )

  const contagens = useMemo(() => {
    const base: Record<FiltroStatus, number> = {
      PENDENTE: 0,
      APROVADA: 0,
      RECUSADA: 0,
      REMOVIDA: 0,
    }
    for (const s of solicitacoes) base[s.status] += 1
    return base
  }, [solicitacoes])

  const filtradas = solicitacoes.filter((s) => s.status === filtro)

  if (solicitacoes.length === 0) {
    return (
      <MotionEmptyState
        title="Nenhuma solicitação de unidade"
        description="Elas chegam do onboarding (“Solicitar cadastro de unidade”) ou pela aba Registrar."
      />
    )
  }

  return (
    <div className="space-y-4">
      <MotionTabBar
        items={ORDEM_FILTROS.map((id) => ({
          id,
          label: FILTRO_LABEL[id],
          count: contagens[id] > 0 ? contagens[id] : undefined,
        }))}
        activeId={filtro}
        onTabChange={(id) => setFiltro(id as FiltroStatus)}
        layoutId="super-admin-afiliacoes-status-tabs"
      />

      <AnimatePresence mode="wait">
        <m.div
          key={filtro}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={springSnappy}
          className="space-y-4"
        >
          {filtradas.length === 0 ? (
            <MotionEmptyState
              title={`Nenhuma solicitação ${FILTRO_LABEL[filtro].toLowerCase()}`}
              description="Troque de aba para ver outros status."
            />
          ) : (
            filtradas.map((s) => (
              <AfiliacaoPedidoCard
                key={s.id}
                pedido={s}
                podeDecidir
                torcidaNome={s.torcidaNome}
                extra={promocaoNode(s) ?? undefined}
              />
            ))
          )}
        </m.div>
      </AnimatePresence>
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
