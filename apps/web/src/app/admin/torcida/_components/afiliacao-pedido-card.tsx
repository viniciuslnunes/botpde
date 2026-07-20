'use client'

import { useActionState, useState } from 'react'
import { Check, Loader2, MapPin, Pencil, Phone, X } from 'lucide-react'
import {
  aprovarSolicitacao,
  editarSolicitacao,
  recusarSolicitacao,
  type SolicitacaoActionState,
} from '../afiliacao-actions'

export interface SolicitacaoView {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  contatoNome: string
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: string
}

const TIPO_LABEL: Record<SolicitacaoView['tipo'], string> = {
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]'

function Feedback({ state }: { state: SolicitacaoActionState }) {
  if (!state.message) return null
  return (
    <p
      className={
        state.success
          ? 'text-xs text-[rgb(var(--color-success-fg))]'
          : 'text-xs text-red-600 dark:text-red-400'
      }
      role={state.success ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  )
}

export function AfiliacaoPedidoCard({
  pedido,
  podeDecidir,
}: {
  pedido: SolicitacaoView
  podeDecidir: boolean
}) {
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
  const pendente = pedido.status === 'PENDENTE'

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.4)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[rgb(var(--foreground))]">
            {pedido.nome}
            <span className="ml-1.5 rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
              {TIPO_LABEL[pedido.tipo]}
            </span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[rgb(var(--foreground-muted))]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {pedido.cidade}/{pedido.estado}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {pedido.contatoNome}
              {pedido.contatoTelefone ? ` · ${pedido.contatoTelefone}` : ''}
            </span>
          </p>
          {pedido.vinculo && (
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Credenciamento: {pedido.vinculo}
            </p>
          )}
          {pedido.provasUrls.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-2 text-xs">
              {pedido.provasUrls.map((url, i) => (
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
        </div>
        <span
          className={
            pendente
              ? 'shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))]'
          }
        >
          {pendente ? 'Pendente' : 'Aprovada'}
        </span>
      </div>

      {pendente && podeDecidir && modo === 'ver' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={aprovarAction}>
            <input type="hidden" name="solicitacaoId" value={pedido.id} />
            <button
              type="submit"
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {aprovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aprovar
            </button>
          </form>
          <button
            type="button"
            onClick={() => setModo('editar')}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setModo('recusar')}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <X className="h-3.5 w-3.5" />
            Recusar
          </button>
        </div>
      )}

      {pendente && podeDecidir && modo === 'recusar' && (
        <form action={recusarAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="solicitacaoId" value={pedido.id} />
          <input name="motivo" required minLength={3} maxLength={500} placeholder="Motivo da recusa" className={`min-w-0 flex-1 ${inputClass}`} />
          <button
            type="submit"
            disabled={ocupado}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {recusando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirmar recusa
          </button>
          <button type="button" onClick={() => setModo('ver')} className="text-xs text-[rgb(var(--foreground-muted))] hover:underline">
            Cancelar
          </button>
        </form>
      )}

      {pendente && podeDecidir && modo === 'editar' && (
        <form action={editarAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="solicitacaoId" value={pedido.id} />
          <input name="nome" defaultValue={pedido.nome} required minLength={3} maxLength={100} className={inputClass} />
          <select name="tipo" defaultValue={pedido.tipo} className={inputClass}>
            <option value="PONTO_ENCONTRO">PDE</option>
            <option value="SUBSEDE">Subsede</option>
          </select>
          <input name="cidade" defaultValue={pedido.cidade} required className={inputClass} />
          <input name="estado" defaultValue={pedido.estado} required maxLength={2} className={inputClass} />
          <input name="endereco" defaultValue={pedido.endereco ?? ''} placeholder="Endereço (opcional)" className={`sm:col-span-2 ${inputClass}`} />
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" disabled={ocupado} className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              Salvar
            </button>
            <button type="button" onClick={() => setModo('ver')} className="text-xs text-[rgb(var(--foreground-muted))] hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-2 space-y-1">
        <Feedback state={aprovarState} />
        <Feedback state={recusarState} />
        <Feedback state={editarState} />
      </div>
    </div>
  )
}
