'use client'

import { useState } from 'react'
import { CheckInButton } from '@/app/admin/eventos/[id]/checkin-button'
import { CheckInPorQr } from '@/components/eventos/checkin-por-qr'
import { ExportEmbarqueCsvButton } from '@/components/eventos/export-embarque-csv'
import { PromoverEsperaButton } from '@/components/eventos/promover-espera-button'
import { STATUS_PAGAMENTO_VAGA } from '@torcida/types'
import { UserCheck, UserX, Hourglass, MapPin } from 'lucide-react'

export type StatusPagamentoEmbarque = keyof typeof STATUS_PAGAMENTO_VAGA

export type EmbarqueRow = {
  id: string
  userId: string
  nome: string
  email: string
  status: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA'
  checkedInAt: string | null
  /** Ledger por trecho. Só a caravana usa; os demais eventos têm uma perna só. */
  embarcouIda?: boolean
  embarcouVolta?: boolean
  /** Registrou embarque fora do raio esperado. Sinal para o gestor, não trava. */
  embarqueLonge?: boolean
  /** Preenchido só quando o evento tem valorVaga (caravana paga). */
  pagamento?: StatusPagamentoEmbarque
  labelPagamento?: string
  alertaPagamento?: boolean
}

const TOM_PAGAMENTO: Record<string, string> = {
  neutral: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  success: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

function BadgePagamento({
  pagamento,
  label,
}: {
  pagamento: StatusPagamentoEmbarque
  label: string
}) {
  if (pagamento === 'NAO_APLICA') return null
  const tom = STATUS_PAGAMENTO_VAGA[pagamento]?.tom ?? 'neutral'
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TOM_PAGAMENTO[tom] ?? TOM_PAGAMENTO.neutral}`}
    >
      {label}
    </span>
  )
}

/**
 * Marca de trecho: preenchida quando a pessoa embarcou naquela perna.
 *
 * Ida e volta lado a lado é o que deixa visível o caso que importa — quem foi
 * e não voltou no ônibus. Um só campo de presença esconderia exatamente isso.
 */
function MarcaTrecho({ label, feito }: { label: string; feito: boolean }) {
  return (
    <span
      className={[
        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        feito
          ? 'bg-[rgb(var(--color-success)_/_0.16)] text-[rgb(var(--color-success-fg))]'
          : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
      ].join(' ')}
      title={feito ? `Embarcou — ${label.toLowerCase()}` : `Não embarcou — ${label.toLowerCase()}`}
    >
      {label}
    </span>
  )
}

type FiltroPagamento = 'todos' | 'alerta' | 'pago'

export function ListaEmbarque({
  eventoId,
  itens,
  podeGerir,
  labelCheckin = 'Embarque',
  tituloEvento,
  mostrarPagamento = false,
  mostrarTrechos = false,
}: {
  eventoId: string
  itens: EmbarqueRow[]
  podeGerir: boolean
  labelCheckin?: string
  tituloEvento?: string
  /** Liga badges/KPIs/filtro de pagamento (caravana com valorVaga). */
  mostrarPagamento?: boolean
  /** Liga as marcas de ida/volta por pessoa (caravana). */
  mostrarTrechos?: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroPagamento>('todos')

  const confirmados = itens.filter((i) => i.status === 'CONFIRMADO')
  const recusados = itens.filter((i) => i.status === 'RECUSADO')
  const espera = itens.filter((i) => i.status === 'LISTA_ESPERA')
  const embarcados = confirmados.filter((i) => i.checkedInAt).length

  const pagos = confirmados.filter((i) => i.pagamento === 'PAGO').length
  const pagosEmbarcados = confirmados.filter(
    (i) => i.pagamento === 'PAGO' && i.checkedInAt,
  ).length
  const pagosFaltando = confirmados.filter(
    (i) => i.pagamento === 'PAGO' && !i.checkedInAt,
  ).length
  const embarcadosSemPagar = confirmados.filter(
    (i) => i.checkedInAt && i.alertaPagamento,
  ).length
  const pendentesPagamento = confirmados.filter(
    (i) => !i.checkedInAt && i.alertaPagamento,
  ).length

  const confirmadosVisiveis = confirmados.filter((i) => {
    if (!mostrarPagamento || filtro === 'todos') return true
    if (filtro === 'pago') return i.pagamento === 'PAGO'
    return Boolean(i.alertaPagamento)
  })

  if (itens.length === 0 && !podeGerir) {
    return (
      <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Ninguém respondeu ainda. Peça RSVP no detalhe ou compartilhe o link.
      </p>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Lista de {labelCheckin.toLowerCase()}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {embarcados}/{confirmados.length} com check-in · {confirmados.length} confirmado
            {confirmados.length === 1 ? '' : 's'}
            {espera.length > 0 ? ` · ${espera.length} na espera` : ''}
          </p>
          {podeGerir && (
            <ExportEmbarqueCsvButton
              titulo={tituloEvento ?? labelCheckin}
              itens={itens}
              incluirPagamento={mostrarPagamento}
              incluirTrechos={mostrarTrechos}
            />
          )}
        </div>
      </div>

      {mostrarPagamento && confirmados.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Pagos embarcados
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {pagosEmbarcados}/{pagos}
            </p>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Pagos faltando
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {pagosFaltando}
            </p>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Embarcados sem pagar
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
              {embarcadosSemPagar}
              {pendentesPagamento > 0 ? (
                <span className="ml-1 text-[10px] font-normal text-[rgb(var(--foreground-muted))]">
                  · {pendentesPagamento} aguardando
                </span>
              ) : null}
            </p>
          </div>
        </div>
      )}

      {mostrarPagamento && podeGerir && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['todos', 'Todos'],
              ['alerta', 'Sem pagar'],
              ['pago', 'Pagos'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={
                filtro === id
                  ? 'rounded-full bg-[rgb(var(--primary)_/_0.14)] px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--color-primary-fg))]'
                  : 'rounded-full border border-[rgb(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))]'
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {podeGerir && <CheckInPorQr eventoId={eventoId} />}

      {itens.length === 0 ? (
        <p className="text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda sem RSVPs — você já pode registrar check-in pelo QR.
        </p>
      ) : null}

      {confirmadosVisiveis.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-success">
            <UserCheck className="h-3.5 w-3.5" />
            Confirmados
            {mostrarPagamento && filtro !== 'todos'
              ? ` (${confirmadosVisiveis.length})`
              : null}
          </p>
          <ul className="space-y-1.5">
            {confirmadosVisiveis.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--foreground))]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{r.nome}</span>
                  {mostrarTrechos ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <MarcaTrecho label="Ida" feito={Boolean(r.embarcouIda)} />
                      <MarcaTrecho label="Volta" feito={Boolean(r.embarcouVolta)} />
                      {r.embarqueLonge ? (
                        <MapPin
                          className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-label="Embarque registrado longe do local"
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {mostrarPagamento && r.pagamento && r.labelPagamento ? (
                    <BadgePagamento pagamento={r.pagamento} label={r.labelPagamento} />
                  ) : null}
                </span>
                {podeGerir ? (
                  <CheckInButton
                    eventoId={eventoId}
                    userId={r.userId}
                    checkedInAt={r.checkedInAt}
                  />
                ) : r.checkedInAt ? (
                  <span className="text-xs font-medium text-success">
                    Check-in ok
                  </span>
                ) : (
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">Aguardando</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {espera.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Hourglass className="h-3.5 w-3.5" />
            Lista de espera ({espera.length})
          </p>
          <ul className="space-y-1.5">
            {espera.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--foreground))]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{r.nome}</span>
                  {mostrarPagamento && r.pagamento && r.labelPagamento ? (
                    <BadgePagamento pagamento={r.pagamento} label={r.labelPagamento} />
                  ) : null}
                </span>
                {podeGerir && <PromoverEsperaButton eventoId={eventoId} userId={r.userId} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recusados.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-500">
            <UserX className="h-3.5 w-3.5" />
            Recusados ({recusados.length})
          </p>
          <ul className="space-y-1 text-sm text-[rgb(var(--foreground-muted))]">
            {recusados.map((r) => (
              <li key={r.id} className="truncate">
                {r.nome}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
