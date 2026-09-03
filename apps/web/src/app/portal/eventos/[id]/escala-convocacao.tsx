'use client'

import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { FUNCAO_ESCALA_DESCRICAO, FUNCAO_ESCALA_LABEL } from '@torcida/types'
import { AppButton } from '@/components/ui/button'
import { runPersistAction } from '@/lib/toast-action'
import { responderConvocacaoEscala } from '@/app/portal/eventos/escala-actions'

/**
 * "Você foi escalado" — o outro lado da convocação. Fica no hero do evento, ao
 * lado do RSVP, porque são perguntas diferentes: RSVP é "você vai?", escala é
 * "você assume este posto?".
 */
export function EscalaConvocacao({
  escalaId,
  funcao,
  observacao,
  statusInicial,
}: {
  escalaId: string
  funcao: string
  observacao: string | null
  statusInicial: string
}) {
  const [status, setStatus] = useState(statusInicial)
  const [pendente, startTransition] = useTransition()

  const label = FUNCAO_ESCALA_LABEL[funcao as keyof typeof FUNCAO_ESCALA_LABEL] ?? funcao
  const descricao = FUNCAO_ESCALA_DESCRICAO[funcao as keyof typeof FUNCAO_ESCALA_DESCRICAO] ?? ''

  function responder(aceita: boolean) {
    startTransition(async () => {
      const ok = await runPersistAction(() => responderConvocacaoEscala(escalaId, aceita), {
        id: `escala-resposta-${escalaId}`,
        success: aceita ? 'Posto confirmado.' : 'Recusa registrada.',
      })
      if (ok) setStatus(aceita ? 'ACEITO' : 'RECUSADO')
    })
  }

  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.06)] p-3 sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Você está na escala
      </p>
      <p className="mt-1 text-sm font-medium text-[rgb(var(--foreground))]">
        {label}
        {observacao ? ` · ${observacao}` : ''}
      </p>
      {descricao && (
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{descricao}</p>
      )}

      {status === 'ACEITO' ? (
        <p className="mt-2.5 text-sm text-[rgb(var(--color-success-fg))]">
          Posto confirmado — a operação conta com você.
        </p>
      ) : status === 'RECUSADO' ? (
        <p className="mt-2.5 text-sm text-[rgb(var(--foreground-muted))]">
          Você recusou este posto. Quem organiza já foi avisado.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant="primary"
            size="sm"
            icon={Check}
            disabled={pendente}
            onClick={() => responder(true)}
          >
            Assumo
          </AppButton>
          <AppButton
            type="button"
            variant="secondary-soft"
            size="sm"
            icon={X}
            disabled={pendente}
            onClick={() => responder(false)}
          >
            Não posso
          </AppButton>
        </div>
      )}
    </div>
  )
}
