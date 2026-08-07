'use client'

import { useTransition, type ReactNode, type MouseEvent, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { registrarCanalVisitadoAction } from '@/app/portal/comunidade/socio-canais-actions'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'

const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/([^/]+)\/?$/

type Props = {
  href?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  'aria-current'?: 'page' | undefined
  'aria-label'?: string
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Link que sai do mural `/canais/[id]` preservando o foco Caso A (e ativando
 * tenant Caso B quando couber). Usar em **qualquer** destino da nav (Feed,
 * Grupos, Canais, Salvos…) — senão a marca/cookie só sobrevive pelo caminho
 * Canais e o header cai na Sede.
 */
export function CanalFocoNavLink({
  href = '/portal/comunidade/canais',
  className,
  style,
  children,
  'aria-current': ariaCurrent,
  'aria-label': ariaLabel,
  onClick: onClickProp,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const canalId = pathname.match(CANAL_DETALHE_RE)?.[1] ?? null

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    onClickProp?.(e)
    if (e.defaultPrevented) return
    if (!canalId || pending) return
    e.preventDefault()
    startTransition(async () => {
      await registrarCanalVisitadoAction(canalId)
      router.push(href)
      // Tenant (Caso B) e/ou marca Caso A — layout precisa reler cookies.
      router.refresh()
    })
  }

  return (
    <ComunidadePrefetchLink
      href={href}
      className={className}
      style={style}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      aria-disabled={pending || undefined}
      onClick={onClick}
    >
      {children}
    </ComunidadePrefetchLink>
  )
}

/** @deprecated Prefer `CanalFocoNavLink` — mesmo comportamento. */
export const CanaisListLink = CanalFocoNavLink
