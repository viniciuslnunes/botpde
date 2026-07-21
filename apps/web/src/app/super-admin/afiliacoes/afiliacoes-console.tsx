'use client'

import { useActionState, useState } from 'react'
import { Check, Handshake, Loader2, MapPin, Pencil, Phone, Rocket, X } from 'lucide-react'
import {
  aprovarSolicitacao,
  criarSolicitacaoManual,
  editarSolicitacao,
  recusarSolicitacao,
  type SolicitacaoActionState,
} from '@/app/admin/torcida/afiliacao-actions'
import { promoverUnidadeAPortal, type PromoverState } from './promover-actions'
import { SearchableSelect, type ComboOption } from './searchable-select'

export interface SolicitacaoView {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  torcidaNome: string
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  contatoNome: string
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

const STATUS_STYLE: Record<SolicitacaoView['status'], string> = {
  PENDENTE: 'bg-amber-950/60 text-amber-200 border-amber-800',
  APROVADA: 'bg-emerald-950/60 text-emerald-200 border-emerald-800',
  RECUSADA:
    'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] border-[rgb(var(--border))]',
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

function CriarManualForm({ torcidas }: { torcidas: TorcidaOption[] }) {
  const [state, action, pending] = useActionState<SolicitacaoActionState, FormData>(
    criarSolicitacaoManual,
    {},
  )
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  const torcidaOptions: ComboOption[] = torcidas.map((t) => ({
    id: t.id,
    label: t.nome,
    sublabel: t.clubeNome ?? undefined,
  }))

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <Handshake className="h-4 w-4" />
        Registrar solicitação manualmente
      </button>
    )
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Registrar solicitação (intake manual)
        </h2>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          Fechar
        </button>
      </div>

      <input type="hidden" name="tenantId" value={tenantId ?? ''} />
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
        <Campo name="nome" label="Nome da unidade" placeholder="Ex.: Gaviões Praia Grande" />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Tipo</label>
          <select name="tipo" defaultValue="PONTO_ENCONTRO" className={INPUT_CLASS}>
            <option value="PONTO_ENCONTRO">Ponto de encontro / PDE</option>
            <option value="SUBSEDE">Subsede</option>
          </select>
        </div>
        <Campo name="cidade" label="Cidade" placeholder="Cidade" />
        <Campo name="estado" label="UF" placeholder="SP" maxLength={2} />
        <Campo name="endereco" label="Endereço (opcional)" placeholder="Rua, nº, bairro" wide />
        <Campo name="contatoNome" label="Contato (liderança)" placeholder="Nome do responsável" wide />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !tenantId}
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
}: {
  name: string
  label: string
  placeholder: string
  maxLength?: number
  wide?: boolean
}) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">{label}</label>
      <input name={name} placeholder={placeholder} maxLength={maxLength} className={INPUT_CLASS} />
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
              {s.contatoNome}
              {s.contatoTelefone ? ` · ${s.contatoTelefone}` : ''}
              {s.contatoEmail ? ` · ${s.contatoEmail}` : ''}
            </span>
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
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}
        >
          {s.status}
        </span>
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
              Aprovar e criar unidade
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

export function AfiliacoesConsole({
  solicitacoes,
  torcidas,
}: {
  solicitacoes: SolicitacaoView[]
  torcidas: TorcidaOption[]
}) {
  return (
    <div className="space-y-6">
      <CriarManualForm torcidas={torcidas} />

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Solicitações de unidade</h2>
        {solicitacoes.length === 0 ? (
          <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma solicitação. Elas chegam do onboarding (&quot;Solicitar cadastro de unidade&quot;)
            ou pelo registro manual acima.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {solicitacoes.map((s) => (
              <SolicitacaoCard key={s.id} s={s} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
