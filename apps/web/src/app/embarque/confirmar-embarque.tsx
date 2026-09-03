'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Ticket } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { obterCoordenadaBestEffort } from '@/lib/geolocalizacao'
import { TRECHOS_EMBARQUE } from '@torcida/types'
import { confirmarEmbarquePorQr, type ResultadoAutoEmbarque } from './actions'

/**
 * O toque que fecha o embarque do lado do sócio.
 *
 * Uma tentativa por leitura: se der errado, a saída é apontar a câmera de novo
 * para o QR (que já virou), não insistir no mesmo código expirado — por isso
 * não há botão de "tentar de novo" com o mesmo payload.
 */
export function ConfirmarEmbarque({ payload, eventoId }: { payload: string; eventoId: string }) {
  const [resultado, setResultado] = useState<ResultadoAutoEmbarque | null>(null)
  const [pendente, iniciar] = useTransition()

  function confirmar() {
    iniciar(async () => {
      // Sem coordenada o embarque acontece igual — é contexto para o gestor,
      // não permissão de entrada.
      const coords = await obterCoordenadaBestEffort()
      setResultado(await confirmarEmbarquePorQr(payload, coords))
    })
  }

  if (resultado?.ok) {
    return (
      <div className="space-y-3">
        <div className="alert-success rounded-xl border p-4">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Embarque confirmado — {TRECHOS_EMBARQUE[resultado.trecho].curto.toLowerCase()}
          </p>
          {resultado.alerta && (
            <p className="mt-1.5 inline-flex items-start gap-1.5 text-left text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Sua vaga ainda não consta como paga. Procure a organização para regularizar.
            </p>
          )}
        </div>
        <Link
          href={`/portal/eventos/${eventoId}`}
          className="app-touch-line inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))]"
        >
          Ver a caravana
        </Link>
      </div>
    )
  }

  if (resultado && !resultado.ok) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-[rgb(var(--foreground))]">{resultado.motivo}</p>
        </div>
        <Link
          href={`/portal/eventos/${eventoId}`}
          className="app-touch-line inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))]"
        >
          Ver a caravana
        </Link>
      </div>
    )
  }

  return (
    <AppButton
      variant="primary"
      size="lg"
      icon={Ticket}
      type="button"
      onClick={confirmar}
      disabled={pendente}
      loading={pendente}
      block
    >
      Confirmar meu embarque
    </AppButton>
  )
}
