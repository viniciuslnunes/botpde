'use client'

import { CheckInButton } from '@/app/admin/eventos/[id]/checkin-button'
import { CheckInPorQr } from '@/components/eventos/checkin-por-qr'
import { ExportEmbarqueCsvButton } from '@/components/eventos/export-embarque-csv'
import { PromoverEsperaButton } from '@/components/eventos/promover-espera-button'
import { UserCheck, UserX, Hourglass } from 'lucide-react'

export type EmbarqueRow = {
  id: string
  userId: string
  nome: string
  email: string
  status: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA'
  checkedInAt: string | null
}

export function ListaEmbarque({
  eventoId,
  itens,
  podeGerir,
  labelCheckin = 'Embarque',
  tituloEvento,
}: {
  eventoId: string
  itens: EmbarqueRow[]
  podeGerir: boolean
  labelCheckin?: string
  tituloEvento?: string
}) {
  const confirmados = itens.filter((i) => i.status === 'CONFIRMADO')
  const recusados = itens.filter((i) => i.status === 'RECUSADO')
  const espera = itens.filter((i) => i.status === 'LISTA_ESPERA')
  const embarcados = confirmados.filter((i) => i.checkedInAt).length

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
            />
          )}
        </div>
      </div>

      {podeGerir && <CheckInPorQr eventoId={eventoId} />}

      {itens.length === 0 ? (
        <p className="text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda sem RSVPs — você já pode registrar check-in pelo QR.
        </p>
      ) : null}

      {confirmados.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <UserCheck className="h-3.5 w-3.5" />
            Confirmados
          </p>
          <ul className="space-y-1.5">
            {confirmados.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--foreground))]"
              >
                <span className="truncate">{r.nome}</span>
                {podeGerir ? (
                  <CheckInButton
                    eventoId={eventoId}
                    userId={r.userId}
                    checkedInAt={r.checkedInAt}
                  />
                ) : r.checkedInAt ? (
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
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
                <span className="truncate">{r.nome}</span>
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
