import Link from 'next/link'
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
  type LucideIcon,
} from 'lucide-react'
import { getResumoBadgesComunidade } from '@/lib/notificacoes-comunidade'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: number
}

export function ComunidadeFeedNavFallback() {
  return (
    <nav className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-3 py-2"
          aria-hidden
        >
          <div className="h-4 w-4 animate-pulse rounded bg-[rgb(var(--border))]" />
          <div className="h-4 flex-1 animate-pulse rounded bg-[rgb(var(--border))]" />
        </div>
      ))}
    </nav>
  )
}

export async function ComunidadeFeedNav({
  tenantId,
  userId,
  currentUserId,
}: {
  tenantId: string
  userId: string
  currentUserId: string
}) {
  const badges = await getResumoBadgesComunidade(tenantId, userId)

  const navItems: NavItem[] = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss, active: true },
    { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart },
    { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark },
    { href: '/portal/comunidade/busca', label: 'Buscar', icon: Search },
    { href: '/portal/comunidade/videos', label: 'Vídeos', icon: Video },
    { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users },
    { href: '/portal/comunidade/canais', label: 'Canais', icon: Radio },
    {
      href: '/portal/comunidade/notificacoes',
      label: 'Notificações',
      icon: Bell,
      badge: badges.notificacoesNaoLidas,
    },
    {
      href: '/portal/comunidade/seguindo',
      label: 'Solicitações',
      icon: UserPlus,
      badge: badges.solicitacoesPendentes,
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
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              item.active
                ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
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
          </Link>
        )
      })}
    </nav>
  )
}
