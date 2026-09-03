'use client'

import { useTransition } from 'react'
import { Repeat2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { repostarComunicado } from '@/app/portal/comunidade/actions'
import { AppButton } from '@/components/ui/button'

interface ComunicadoShareButtonProps {
  comunicadoId: string
}

export function ComunicadoShareButton({ comunicadoId }: ComunicadoShareButtonProps) {
  const [pending, startTransition] = useTransition()

  function compartilhar() {
    startTransition(async () => {
      try {
        await repostarComunicado(comunicadoId)
        toast.success('Comunicado compartilhado no feed')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao compartilhar')
      }
    })
  }

  return (
    <AppButton
      variant="none"
      icon={Repeat2}
      loading={pending}
      type="button"
      onClick={compartilhar}
      disabled={pending}
      title="Compartilhar no feed"
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))] disabled:opacity-50"
    >
      Compartilhar
    </AppButton>
  )
}
