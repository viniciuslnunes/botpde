'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  FileSearch,
  Handshake,
  LayoutDashboard,
  PlusCircle,
  ScrollText,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'

export interface SuperAdminNavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Rota exata — não faz match por prefixo (evita conflito com `/super-admin/torcidas` etc.). */
  exact?: boolean
}

export const SUPER_ADMIN_NAV_ITEMS: SuperAdminNavItem[] = [
  { href: '/super-admin', label: 'Visão geral', icon: LayoutDashboard, exact: true },
  { href: '/super-admin/torcidas', label: 'Torcidas', icon: Building2 },
  { href: '/super-admin/afiliacoes', label: 'Afiliações', icon: Handshake },
  { href: '/super-admin/usuarios', label: 'Usuários', icon: UserCheck },
  { href: '/super-admin/auditoria', label: 'Auditoria', icon: ScrollText },
  {
    href: '/super-admin/relatorios/perfis-torcedores-privados',
    label: 'Relatórios',
    icon: FileSearch,
  },
  { href: '/super-admin/setup', label: 'Criar torcida', icon: PlusCircle },
]

export function SuperAdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5 px-3" aria-label="Menu super admin">
      {SUPER_ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={[
              'app-action flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            <Icon
              className={[
                'h-4 w-4 shrink-0 transition-colors',
                active
                  ? 'text-[rgb(var(--color-primary-fg))]'
                  : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
