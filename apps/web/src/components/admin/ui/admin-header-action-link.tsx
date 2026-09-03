import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppButtonLink, type AppButtonVariant } from '@/components/ui/button'

export type AdminHeaderActionLinkProps = {
  href: string
  icon: LucideIcon
  children: ReactNode
  /** Default `outline` — secundário ao CTA primário do header (ex.: Novo evento). */
  variant?: AppButtonVariant
}

/**
 * Ação de cabeçalho admin que navega (`AppButtonLink`) — "Agenda da semana",
 * "Ver no portal", etc. Substitui o `<Link className="app-touch-line">` solto.
 */
export function AdminHeaderActionLink({
  href,
  icon,
  children,
  variant = 'outline',
}: AdminHeaderActionLinkProps) {
  return (
    <AppButtonLink href={href} variant={variant} size="sm" icon={icon}>
      {children}
    </AppButtonLink>
  )
}
