'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'
import { NavLinkStatusReporter } from './nav-pending-context'

interface PortalNavLinkProps {
  href: string
  prefetch?: boolean
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
  return (
    <Link href={href} prefetch={prefetch} onClick={onClick} className={className}>
      <NavLinkStatusReporter />
      <span className="flex items-center gap-1.5">
        {showSpinner && <LinkPendingSpinner />}
        {children}
      </span>
    </Link>
  )
}
