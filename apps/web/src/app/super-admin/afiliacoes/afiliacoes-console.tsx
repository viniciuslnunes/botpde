'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { Check, Handshake, Loader2, Unlink, X } from 'lucide-react'
import {
  aprovarAfiliacao,
  encerrarAfiliacao,
  recusarAfiliacao,
  registrarPedidoAfiliacao,
  type AfiliacaoActionState,
} from '@/app/admin/torcida/afiliacao-actions'
import { SearchableSelect, type ComboOption } from './searchable-select'

export interface AfiliacaoAdminView {
  id: string
  status: 'PENDENTE' | 'ATIVA' | 'RECUSADA' | 'ENCERRADA'
  unidadeNome: string
  unidadeTipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  sedePaiNome: string | null
  criadoEm: string
  motivo: string | null
}

/** Uma unidade afiliável = tenant independente (via sua Sede raiz) + clube. */
export interface UnidadeOption {
  sedeId: string
  tenantId: string
  nome: string
  local: string | null
  afiliacaoId: string | null
  clubeNome: string | null
  /** Já tem pedido PENDENTE/ATIVA como candidata (não pode abrir outro). */
  ocupada: boolean
}

const TIPO_LABEL: Record<AfiliacaoAdminView['unidadeTipo'], string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const STATUS_STYLE: Record<AfiliacaoAdminView['status'], string> = {
  PENDENTE: 'bg-amber-950/60 text-amber-200 border-amber-800',
  ATIVA: 'bg-emerald-950/60 text-emerald-200 border-emerald-800',
  RECUSADA: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  ENCERRADA: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

function Feedback({ state }: { state: AfiliacaoActionState }) {
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

function localSub(u: UnidadeOption): string {
  return [u.clubeNome, u.local].filter(Boolean).join(' · ') || 'sem clube definido'
}

function RegistrarForm({ unidades }: { unidades: UnidadeOption[] }) {
  const [state, action, pending] = useActionState<AfiliacaoActionState, FormData>(
    registrarPedidoAfiliacao,
    {},
  )
  const [unidadeSedeId, setUnidadeSedeId] = useState<string | null>(null)
  const [sedePaiTenantId, setSedePaiTenantId] = useState<string | null>(null)
  const [mostrarMsg, setMostrarMsg] = useState(false)

  const porSede = useMemo(
    () => new Map(unidades.map((u) => [u.sedeId, u])),
    [unidades],
  )
  const unidadeSel = unidadeSedeId ? (porSede.get(unidadeSedeId) ?? null) : null

  // Candidatas: só as não-ocupadas.
  const candidatasOptions: ComboOption[] = useMemo(
    () =>
      unidades
        .filter((u) => !u.ocupada)
        .map((u) => ({ id: u.sedeId, label: u.nome, sublabel: localSub(u) })),
    [unidades],
  )

  // Sede-mãe: só tenants do MESMO clube da candidata, exceto ela própria.
  const sedesMaeOptions: ComboOption[] = useMemo(() => {
    if (!unidadeSel) return []
    return unidades
      .filter(
        (u) =>
          u.afiliacaoId &&
          u.afiliacaoId === unidadeSel.afiliacaoId &&
          u.tenantId !== unidadeSel.tenantId,
      )
      .map((u) => ({ id: u.tenantId, label: u.nome, sublabel: u.local ?? '' }))
  }, [unidades, unidadeSel])

  useEffect(() => {
    if (state.success) {
      setUnidadeSedeId(null)
      setSedePaiTenantId(null)
    }
  }, [state])

  function trocarUnidade(id: string | null) {
    setUnidadeSedeId(id)
    setSedePaiTenantId(null) // clube pode mudar → zera a Sede-mãe
    setMostrarMsg(false)
  }

  const semClube = Boolean(unidadeSel && !unidadeSel.afiliacaoId)

  return (
    <form
      action={action}
      onSubmit={() => setMostrarMsg(true)}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Handshake className="h-4 w-4" />
          Registrar pedido de afiliação
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Intake do suporte. Busque a unidade (tenant próprio); a Sede-mãe é filtrada pelo mesmo
          clube. Sem Sede-mãe, o super-admin adere direto.
        </p>
      </div>

      <input type="hidden" name="unidadeSedeId" value={unidadeSedeId ?? ''} />
      <input type="hidden" name="sedePaiTenantId" value={sedePaiTenantId ?? ''} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Unidade candidata</label>
          {candidatasOptions.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-amber-300">
              Nenhuma unidade disponível para afiliar.
            </p>
          ) : (
            <SearchableSelect
              options={candidatasOptions}
              value={unidadeSedeId}
              onChange={trocarUnidade}
              placeholder="Buscar torcida por nome ou cidade…"
            />
          )}
          {unidadeSel && (
            <p className="text-xs text-zinc-500">
              Clube: {unidadeSel.clubeNome ?? '—'}
              {semClube && ' · sem clube: só adesão pelo super-admin (sem Sede-mãe)'}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Sede-mãe (opcional)</label>
          <SearchableSelect
            options={sedesMaeOptions}
            value={sedePaiTenantId}
            onChange={(id) => {
              setSedePaiTenantId(id)
              setMostrarMsg(false)
            }}
            disabled={!unidadeSel || semClube}
            placeholder={
              !unidadeSel ? 'Escolha a unidade primeiro' : 'Buscar Sede-mãe do mesmo clube…'
            }
            emptyText="Nenhuma outra torcida do mesmo clube na plataforma."
          />
          <p className="text-xs text-zinc-500">
            {sedePaiTenantId
              ? 'Presidente/Vice da Sede-mãe decidem.'
              : 'Sem Sede-mãe: o super-admin adere direto.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !unidadeSedeId}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Registrar pedido
        </button>
        {mostrarMsg && <Feedback state={state} />}
      </div>
    </form>
  )
}

function AfiliacaoRow({ afiliacao }: { afiliacao: AfiliacaoAdminView }) {
  const [aprovarState, aprovarAction, aprovando] = useActionState<AfiliacaoActionState, FormData>(
    aprovarAfiliacao,
    {},
  )
  const [recusarState, recusarAction, recusando] = useActionState<AfiliacaoActionState, FormData>(
    recusarAfiliacao,
    {},
  )
  const [encerrarState, encerrarAction, encerrando] = useActionState<
    AfiliacaoActionState,
    FormData
  >(encerrarAfiliacao, {})

  const ocupado = aprovando || recusando || encerrando

  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-200">{afiliacao.unidadeNome}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {TIPO_LABEL[afiliacao.unidadeTipo]}
            {afiliacao.sedePaiNome ? ` → ${afiliacao.sedePaiNome}` : ' → sem Sede-mãe'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[afiliacao.status]}`}
        >
          {afiliacao.status}
        </span>
      </div>

      {afiliacao.motivo && <p className="mt-1 text-xs text-zinc-500">Motivo: {afiliacao.motivo}</p>}

      {afiliacao.status === 'PENDENTE' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={aprovarAction}>
            <input type="hidden" name="afiliacaoId" value={afiliacao.id} />
            <button
              type="submit"
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {aprovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aprovar
            </button>
          </form>
          <form action={recusarAction} className="flex items-center gap-1.5">
            <input type="hidden" name="afiliacaoId" value={afiliacao.id} />
            <input
              name="motivo"
              required
              minLength={3}
              maxLength={500}
              placeholder="Motivo da recusa"
              className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
            >
              {recusando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Recusar
            </button>
          </form>
        </div>
      )}

      {afiliacao.status === 'ATIVA' && (
        <form action={encerrarAction} className="mt-2 flex items-center gap-1.5">
          <input type="hidden" name="afiliacaoId" value={afiliacao.id} />
          <input
            name="motivo"
            required
            minLength={3}
            maxLength={500}
            placeholder="Motivo do encerramento"
            className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {encerrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
            Encerrar
          </button>
        </form>
      )}

      <div className="mt-1 space-y-0.5">
        <Feedback state={aprovarState} />
        <Feedback state={recusarState} />
        <Feedback state={encerrarState} />
      </div>
    </li>
  )
}

export function AfiliacoesConsole({
  afiliacoes,
  unidades,
}: {
  afiliacoes: AfiliacaoAdminView[]
  unidades: UnidadeOption[]
}) {
  return (
    <div className="space-y-6">
      <RegistrarForm unidades={unidades} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Pedidos e vínculos</h2>
        {afiliacoes.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nenhum pedido de afiliação registrado ainda.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {afiliacoes.map((a) => (
              <AfiliacaoRow key={a.id} afiliacao={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
