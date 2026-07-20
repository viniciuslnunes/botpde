'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Handshake, PlusCircle, Users } from 'lucide-react'

const links = [
  { href: '/super-admin/torcidas', label: 'Torcidas', icon: Building2 },
  { href: '/super-admin/afiliacoes', label: 'Afiliações', icon: Handshake },
  {
    href: '/super-admin/relatorios/perfis-torcedores-privados',
    label: 'Relatórios',
    icon: Users,
  },
  { href: '/super-admin/setup', label: 'Criar torcida', icon: PlusCircle },
]

export function SuperAdminNav() {
  const pathname = usePathname()

  return (
    <nav className="mt-4 space-y-0.5 px-2">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-zinc-800 font-medium text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200',
            ].join(' ')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
