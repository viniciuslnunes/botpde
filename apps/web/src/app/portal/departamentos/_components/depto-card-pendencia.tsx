'use client'

import { useNavbarSnapshot } from '@/lib/use-navbar-context'
import { PendenciaBadge } from '@/components/pendencia-badge'

/** Badge de não-lidas do departamento — ao lado do nome no card do hub. */
export function DeptoCardPendencia({ slug }: { slug: string }) {
  const { navBadges } = useNavbarSnapshot()
  return <PendenciaBadge count={navBadges.porSlug[slug] ?? 0} />
}
