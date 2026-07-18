'use client'

import { usePathname } from 'next/navigation'
import {
  Rss,
  UserCircle2,
  UserPlus,
  Video,
  Search,
  Users,
  Heart,
  Bookmark,
  Bell,
  Radio,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/portal/comunidade') return pathname === '/portal/comunidade'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ComunidadeFeedNavClient({
  currentUserId,
  notificacoesNaoLidas = 0,
  solicitacoesPendentes = 0,
}: {
  currentUserId: string
  notificacoesNaoLidas?: number
  solicitacoesPendentes?: number
}) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss },
    { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart },
    { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark },
    { href: '/portal/comunidade/busca', label: 'Buscar', icon: Search },
    { href: '/portal/comunidade/videos', label: 'Vídeos', icon: Video },
    { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users },
    { href: '/portal/comunidade/canais', label: 'Canais', icon: Radio },
    { href: '/portal/comunidade/classificacao', label: 'Classificação', icon: ListOrdered },
    {
      href: '/portal/comunidade/notificacoes',
      label: 'Notificações',
      icon: Bell,
      badge: notificacoesNaoLidas,
    },
    {
      href: '/portal/comunidade/seguindo',
      label: 'Solicitações',
      icon: UserPlus,
      badge: solicitacoesPendentes,
    },
    ...(currentUserId
      ? [
          {
            href: `/portal/comunidade/perfil/${currentUserId}`,
            label: 'Meu perfil',
            icon: UserCircle2,
          },
        ]
      : []),
  ]

  return (
    <nav className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isNavActive(pathname, item.href)
        return (
          <ComunidadePrefetchLink
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {(item.badge ?? 0) > 0 && (
              <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-5 text-white">
                {(item.badge ?? 0) > 9 ? '9+' : item.badge}
              </span>
            )}
          </ComunidadePrefetchLink>
        )
      })}
    </nav>
  )
}
