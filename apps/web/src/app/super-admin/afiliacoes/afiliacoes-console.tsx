'use client'

import { useActionState } from 'react'
import { Check, Handshake, Loader2, Unlink, X } from 'lucide-react'
import {
  aprovarAfiliacao,
  encerrarAfiliacao,
  recusarAfiliacao,
  registrarPedidoAfiliacao,
  type AfiliacaoActionState,
} from '@/app/admin/torcida/afiliacao-actions'

export interface AfiliacaoAdminView {
  id: string
  status: 'PENDENTE' | 'ATIVA' | 'RECUSADA' | 'ENCERRADA'
  unidadeNome: string
  unidadeTipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  sedePaiNome: string | null
  criadoEm: string
  motivo: string | null
}

export interface UnidadeCandidata {
  sedeId: string
  label: string
}

export interface TenantSedePai {
  id: string
  nome: string
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

function RegistrarForm({
  candidatas,
  sedesPai,
}: {
  candidatas: UnidadeCandidata[]
  sedesPai: TenantSedePai[]
}) {
  const [state, action, pending] = useActionState<AfiliacaoActionState, FormData>(
    registrarPedidoAfiliacao,
    {},
  )

  return (
    <form
      action={action}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Handshake className="h-4 w-4" />
        Registrar pedido de afiliação
      </h2>
      <p className="text-xs text-zinc-500">
        Intake do suporte: escolha a unidade (que já tem portal próprio) e, se houver, a
        Sede-mãe que vai decidir. Sem Sede-mãe, o super-admin adere direto.
      </p>

      {candidatas.length === 0 ? (
        <p className="text-xs text-amber-300">
          Nenhuma unidade com portal próprio disponível para afiliar.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            Unidade candidata
            <select
              name="unidadeSedeId"
              required
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {candidatas.map((c) => (
                <option key={c.sedeId} value={c.sedeId}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-zinc-400">
            Sede-mãe (opcional)
            <select
              name="sedePaiTenantId"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="">Sem Sede-mãe (super-admin adere)</option>
              {sedesPai.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || candidatas.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Registrar pedido
        </button>
        <Feedback state={state} />
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

      {afiliacao.motivo && (
        <p className="mt-1 text-xs text-zinc-500">Motivo: {afiliacao.motivo}</p>
      )}

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
  candidatas,
  sedesPai,
}: {
  afiliacoes: AfiliacaoAdminView[]
  candidatas: UnidadeCandidata[]
  sedesPai: TenantSedePai[]
}) {
  return (
    <div className="space-y-6">
      <RegistrarForm candidatas={candidatas} sedesPai={sedesPai} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Pedidos e vínculos</h2>
        {afiliacoes.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Nenhum pedido de afiliação registrado ainda.
          </p>
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
