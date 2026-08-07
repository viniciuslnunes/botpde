'use client'

import { useTransition, type ReactNode, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { registrarCanalVisitadoAction } from '@/app/portal/comunidade/socio-canais-actions'

type Props = {
  canalId: string
  href: string
  className?: string
  children: ReactNode
  'aria-label'?: string
}

/**
 * Abre o canal na barra 4+ **antes** de navegar — evita corrida em que o
 * cookie ainda não tem o canal anterior ao carregar o mural seguinte.
 */
export function AbrirCanalNaBarraLink({
  canalId,
  href,
  className,
  children,
  'aria-label': ariaLabel,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (pending) return
    startTransition(async () => {
      await registrarCanalVisitadoAction(canalId)
      router.push(href)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      disabled={pending}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
