'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { NavLinkStatusReporter } from './nav-pending-context'

export type PrefetchMode = boolean | 'hover'

interface PortalNavLinkProps {
  href: string
  prefetch?: PrefetchMode
  onClick?: () => void
  className: string
  children: React.ReactNode
  showSpinner?: boolean
}

function LinkPendingSpinner() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
}

export function PortalNavLink({
  href,
  prefetch = true,
  onClick,
  className,
  children,
  showSpinner = true,
}: PortalNavLinkProps) {
  const router = useRouter()
  const prefetched = useRef(false)

  const prefetchOnIntent = useCallback(() => {
    if (prefetch !== 'hover' || prefetched.current) return
    prefetched.current = true
    void router.prefetch(href)
  }, [href, prefetch, router])

  const linkPrefetch = prefetch === 'hover' ? false : prefetch

  return (
    <Link
      href={href}
      prefetch={linkPrefetch}
      onClick={onClick}
      onMouseEnter={prefetch === 'hover' ? prefetchOnIntent : undefined}
      onFocus={prefetch === 'hover' ? prefetchOnIntent : undefined}
      className={className}
    >
      <NavLinkStatusReporter />
      <span className="flex items-center gap-1.5">
        {showSpinner && <LinkPendingSpinner />}
        {children}
      </span>
    </Link>
  )
}
