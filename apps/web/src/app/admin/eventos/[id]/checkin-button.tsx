'use client'

import { useTransition } from 'react'
import { registrarCheckIn } from '../actions'
import { Loader2, ScanLine, CheckCircle2 } from 'lucide-react'

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

  if (checkedInAt) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Check-in {formatarHora(checkedInAt)}
      </span>
    )
  }

  return (
    <button
      onClick={() => startTransition(() => registrarCheckIn(eventoId, userId))}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanLine className="h-3 w-3" />}
      Check-in
    </button>
  )
}
