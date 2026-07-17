'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Ticket } from 'lucide-react'
import { formatarMoedaBRL } from '@torcida/types'
import { solicitarCobrancaVagaCaravana } from '@/app/portal/caravanas/actions'

export function CaravanaVagaPagamento({
  eventoId,
  valorVaga,
  confirmado,
  cobranca,
}: {
  eventoId: string
  valorVaga: number
  confirmado: boolean
  cobranca: { id: string; status: string } | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!(valorVaga > 0)) return null

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Vaga</h2>
      </div>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        Valor por pessoa:{' '}
        <span className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
          {formatarMoedaBRL(valorVaga)}
        </span>
      </p>

      {cobranca?.status === 'PAGA' ? (
        <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Vaga paga.
        </p>
      ) : cobranca && cobranca.status !== 'CANCELADA' ? (
        <Link
          href={`/portal/cobrancas/${cobranca.id}`}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Abrir cobrança ({cobranca.status.toLowerCase()})
        </Link>
      ) : !confirmado ? (
        <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
          Confirme presença para gerar a cobrança da vaga.
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const res = await solicitarCobrancaVagaCaravana(eventoId)
              if (res?.error) setError(res.error)
            })
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Pagar vaga
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
