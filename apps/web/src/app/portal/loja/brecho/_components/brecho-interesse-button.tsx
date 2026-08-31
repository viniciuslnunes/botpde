'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import { interessarBrechoAction } from '../actions'

export function BrechoInteresseButton({
  anuncioId,
  conversaId,
}: {
  anuncioId: string
  conversaId: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (conversaId) {
    return (
      <a
        href={`/portal/mensagens?c=${conversaId}`}
        className="app-action inline-flex items-center justify-center rounded-xl bg-[rgb(var(--color-primary))] px-5 font-semibold text-[rgb(var(--color-primary-on))]"
      >
        Abrir conversa
      </a>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      className="app-action inline-flex items-center justify-center rounded-xl bg-[rgb(var(--color-primary))] px-5 font-semibold text-[rgb(var(--color-primary-on))]"
      onClick={() => {
        start(async () => {
          const r = await interessarBrechoAction(anuncioId)
          if (r.error) {
            toast.error(r.error)
            return
          }
          if (r.conversaId) {
            toast.success('Conversa aberta. Combinem a troca por lá.')
            router.push(`/portal/mensagens?c=${r.conversaId}`)
          }
        })
      }}
    >
      {pending ? 'Abrindo…' : 'Tenho interesse'}
    </button>
  )
}
