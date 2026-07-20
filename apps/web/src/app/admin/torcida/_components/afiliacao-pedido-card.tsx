'use client'

import { useActionState, useState } from 'react'
import { Check, Loader2, ThumbsUp, Unlink, X } from 'lucide-react'
import {
  aprovarAfiliacao,
  encerrarAfiliacao,
  recomendarAfiliacao,
  recusarAfiliacao,
  type AfiliacaoActionState,
} from '../afiliacao-actions'

export interface AfiliacaoPedidoView {
  id: string
  status: 'PENDENTE' | 'ATIVA'
  unidadeNome: string
  unidadeTipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string | null
  estado: string | null
  criadoEm: string
  recomendadoEm: string | null
  recomendadoPorNome: string | null
}

const TIPO_LABEL: Record<AfiliacaoPedidoView['unidadeTipo'], string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

function localDaUnidade(pedido: AfiliacaoPedidoView): string | null {
  if (pedido.cidade && pedido.estado) return `${pedido.cidade} · ${pedido.estado}`
  return pedido.cidade ?? pedido.estado
}

function Feedback({ state }: { state: AfiliacaoActionState }) {
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

/**
 * Card de um pedido/vínculo de afiliação na fila da Sede. Recomendar: qualquer
 * AFFILIATION_MANAGE. Aprovar/Recusar/Encerrar: só owner/super-admin
 * (`podeDecidir`) — e o servidor revalida tudo de novo.
 */
export function AfiliacaoPedidoCard({
  pedido,
  podeDecidir,
}: {
  pedido: AfiliacaoPedidoView
  podeDecidir: boolean
}) {
  const [recomendarState, recomendarAction, recomendando] = useActionState<
    AfiliacaoActionState,
    FormData
  >(recomendarAfiliacao, {})
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
  const [motivoAberto, setMotivoAberto] = useState(false)

  const local = localDaUnidade(pedido)
  const pendente = pedido.status === 'PENDENTE'
  const ocupado = recomendando || aprovando || recusando || encerrando

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.4)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[rgb(var(--foreground))]">{pedido.unidadeNome}</p>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {TIPO_LABEL[pedido.unidadeTipo]}
            {local ? ` · ${local}` : ''}
          </p>
        </div>
        <span
          className={
            pendente
              ? 'shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'shrink-0 rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))]'
          }
        >
          {pendente ? 'Pendente' : 'Ativa'}
        </span>
      </div>

      {pedido.recomendadoEm && (
        <p className="mt-2 flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
          <ThumbsUp className="h-3 w-3 shrink-0" />
          Recomendada{pedido.recomendadoPorNome ? ` por ${pedido.recomendadoPorNome}` : ''}
        </p>
      )}

      {pendente ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <form action={recomendarAction}>
              <input type="hidden" name="afiliacaoId" value={pedido.id} />
              <button
                type="submit"
                disabled={ocupado || Boolean(pedido.recomendadoEm)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                {recomendando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ThumbsUp className="h-3.5 w-3.5" />
                )}
                Recomendar
              </button>
            </form>

            {podeDecidir && (
              <>
                <form action={aprovarAction}>
                  <input type="hidden" name="afiliacaoId" value={pedido.id} />
                  <button
                    type="submit"
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {aprovando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Aprovar
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setMotivoAberto((v) => !v)}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <X className="h-3.5 w-3.5" />
                  Recusar
                </button>
              </>
            )}
          </div>

          {podeDecidir && motivoAberto && (
            <form action={recusarAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="afiliacaoId" value={pedido.id} />
              <input
                name="motivo"
                required
                minLength={3}
                maxLength={500}
                placeholder="Motivo da recusa"
                className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              />
              <button
                type="submit"
                disabled={ocupado}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {recusando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirmar recusa
              </button>
            </form>
          )}
        </div>
      ) : (
        podeDecidir && (
          <div className="mt-3 space-y-2">
            {!motivoAberto ? (
              <button
                type="button"
                onClick={() => setMotivoAberto(true)}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                Encerrar vínculo
              </button>
            ) : (
              <form action={encerrarAction} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="afiliacaoId" value={pedido.id} />
                <input
                  name="motivo"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Motivo do encerramento"
                  className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                />
                <button
                  type="submit"
                  disabled={ocupado}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {encerrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Confirmar encerramento
                </button>
              </form>
            )}
          </div>
        )
      )}

      <div className="mt-2 space-y-1">
        <Feedback state={recomendarState} />
        <Feedback state={aprovarState} />
        <Feedback state={recusarState} />
        <Feedback state={encerrarState} />
      </div>
    </div>
  )
}
