'use client'

import { useState, useTransition } from 'react'
import { registrarCheckIn } from '../actions'
import { CheckCircle2, ScanLine, TicketCheck } from 'lucide-react'
import { toast } from '@torcida/ui/services/toast'
import { isRedirectError } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'

function formatarHora(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(data))
}

export function CheckInButton({
  eventoId,
  userId,
  checkedInAt,
}: {
  eventoId: string
  userId: string
  checkedInAt: Date | string | null
}) {
  const [pending, startTransition] = useTransition()
  const [bloqueado, setBloqueado] = useState(false)

  if (checkedInAt) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--color-success)_/_0.14)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--color-success-fg))]">
        <CheckCircle2 className="h-3 w-3" />
        Check-in {formatarHora(checkedInAt)}
      </span>
    )
  }

  async function executar(override = false) {
    try {
      const result = await registrarCheckIn(eventoId, userId, { override })
      if (!result.ok) {
        if (result.bloqueado) {
          setBloqueado(true)
          toast.warning('Vaga não paga', { description: result.error })
          return
        }
        toast.error(result.error)
        return
      }
      setBloqueado(false)
      if (result.aviso) {
        toast.warning('Check-in registrado', { description: result.aviso })
      } else {
        toast.success('Check-in registrado.')
      }
    } catch (error) {
      if (isRedirectError(error)) throw error
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir.')
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <AppButton
        variant="none"
        icon={ScanLine}
        loading={pending}
        type="button"
        onClick={() => startTransition(() => executar(false))}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-60"
      >
        Check-in
      </AppButton>
      {bloqueado && (
        <AppButton
          variant="none"
          icon={TicketCheck}
          type="button"
          onClick={() => startTransition(() => executar(true))}
          disabled={pending}
          className="text-[10px] font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400 disabled:opacity-60"
        >
          Embarcar mesmo assim
        </AppButton>
      )}
    </span>
  )
}
