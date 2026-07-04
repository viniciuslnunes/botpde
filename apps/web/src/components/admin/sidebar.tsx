'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  MapPin,
  ShoppingBag,
  Settings,
  Calendar,
  KeyRound,
  MessagesSquare,
  Network,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

/** Ícone por id do item de menu (ADMIN_MENU vem de @torcida/types, sem depender de React). */
const ICON_BY_ID: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  membros: Users,
  socios: CreditCard,
  eventos: Calendar,
  sedes: MapPin,
  hierarquia: Network,
  loja: ShoppingBag,
  comunidade: MessagesSquare,
  acessos: KeyRound,
  configuracoes: Settings,
}

interface AdminMenuItem {
  id: string
  label: string
  href: string
  exact?: boolean
}

interface AdminSidebarProps {
  tenantNome: string
  tenantCor: string
  /** Itens já filtrados pelas permissões efetivas do usuário (ver ADMIN_MENU/filterMenuByPermissions) */
  items: AdminMenuItem[]
}

export function AdminSidebar({ tenantNome, tenantCor, items }: AdminSidebarProps) {
  const pathname = usePathname()

  function isActive(item: AdminMenuItem) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {/* Cabeçalho do tenant */}
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ backgroundColor: tenantCor }}
        >
          {tenantNome.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{tenantNome}</p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Administração</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(item)
            const Icon = ICON_BY_ID[item.id] ?? LayoutDashboard
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0 transition-colors',
                      active ? 'text-[rgb(var(--primary))]' : 'text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight className="h-3 w-3 text-[rgb(var(--primary))]" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Rodapé */}
      <div className="border-t border-[rgb(var(--border))] px-5 py-3">
        <Link
          href="/portal"
          className="text-xs text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          ← Voltar ao portal
        </Link>
      </div>
    </aside>
  )
}
