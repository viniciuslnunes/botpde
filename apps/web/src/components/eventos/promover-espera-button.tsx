'use client'

import { useTransition } from 'react'
import { promoverDaListaEspera } from '@/app/admin/eventos/actions'
import { ArrowUp } from 'lucide-react'
import { AppButton } from '@/components/ui/button'

export function PromoverEsperaButton({
  eventoId,
  userId,
}: {
  eventoId: string
  userId: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <AppButton
      variant="none"
      icon={ArrowUp}
      loading={pending}
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await promoverDaListaEspera(eventoId, userId)
        })
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
    >
      Promover
    </AppButton>
  )
}
