'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { moderarTopicoAction } from '../praca-actions'

export function ModerarTopicoBotoes({
  escopo,
  topicoId,
  fixado,
}: {
  escopo: EscopoComunidade
  topicoId: string
  fixado: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function agir(acao: 'fixar' | 'ocultar') {
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('topicoId', topicoId)
    fd.set('acao', acao)
    start(async () => {
      const r = await moderarTopicoAction(fd)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      if (acao === 'ocultar') router.push(`/portal/comunidade/forum?escopo=${escopo}`)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => agir('fixar')}
        className="app-touch-target rounded-lg px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
      >
        {fixado ? 'Desafixar' : 'Fixar no topo'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => agir('ocultar')}
        className="app-touch-target rounded-lg px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
      >
        Ocultar
      </button>
    </div>
  )
}
