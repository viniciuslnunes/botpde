'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Handshake,
  MapPin,
  ShoppingBag,
  Settings,
  Calendar,
  KeyRound,
  MessagesSquare,
  ShieldAlert,
  Newspaper,
  Network,
  ScrollText,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { TenantSwitcher } from '@/components/admin/tenant-switcher'
import type { TorcidaOpcao } from '@/lib/torcida-labels'
import { ThemeToggle } from '@/components/theme-toggle'

/** Ícone por id do item de menu (ADMIN_MENU vem de @torcida/types, sem depender de React). */
const ICON_BY_ID: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  torcida: Building2,
  membros: Users,
  socios: CreditCard,
  eventos: Calendar,
  sedes: MapPin,
  hierarquia: Network,
  loja: ShoppingBag,
  comunidade: MessagesSquare,
  'comunidade-moderacao': ShieldAlert,
  noticias: Newspaper,
  aliancas: Handshake,
  acessos: KeyRound,
  auditoria: ScrollText,
  configuracoes: Settings,
}

interface AdminMenuItem {
  id: string
  label: string
  href: string
  exact?: boolean
}

interface AdminSidebarProps {
  tenantSlug: string
  /** Itens já filtrados pelas permissões efetivas do usuário (ver ADMIN_MENU/filterMenuByPermissions) */
  items: AdminMenuItem[]
  isSuperAdmin?: boolean
  torcidas?: TorcidaOpcao[]
  mobileOpen?: boolean
  onMobileClose?: () => void
}

interface NavItemsProps {
  items: AdminMenuItem[]
  pathname: string
  onNavigate?: () => void
}

function isItemActive(item: AdminMenuItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

function NavItems({ items, pathname, onNavigate }: NavItemsProps) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isItemActive(item, pathname)
        const Icon = ICON_BY_ID[item.id] ?? LayoutDashboard
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={[
                'app-action group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              <Icon
                className={[
                  'h-4 w-4 shrink-0 transition-colors',
                  active
                    ? 'text-[rgb(var(--primary))]'
                    : 'text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="h-3 w-3 shrink-0 text-[rgb(var(--primary))]" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function SidebarBody({
  tenantSlug,
  items,
  pathname,
  isSuperAdmin,
  torcidas,
  onNavigate,
}: {
  tenantSlug: string
  items: AdminMenuItem[]
  pathname: string
  isSuperAdmin: boolean
  torcidas: TorcidaOpcao[]
  onNavigate?: () => void
}) {
  return (
    <>
      {isSuperAdmin && torcidas.length > 0 && (
        <div className="border-b border-[rgb(var(--border))] px-4 py-3">
          <TenantSwitcher
            torcidas={torcidas}
            torcidaAtualSlug={tenantSlug}
            destino="admin"
            variant="admin"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavItems items={items} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-1 border-t border-[rgb(var(--border))] px-3 py-3 lg:hidden">
        <ThemeToggle variant="row" />
        <Link
          href="/portal"
          onClick={onNavigate}
          className="app-action flex items-center rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          Voltar ao portal
        </Link>
      </div>

      <div className="hidden border-t border-[rgb(var(--border))] px-3 py-3 lg:block">
        <Link
          href="/portal"
          className="app-action flex items-center rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          Voltar ao portal
        </Link>
      </div>
    </>
  )
}

export function AdminSidebar({
  tenantSlug,
  items,
  isSuperAdmin = false,
  torcidas = [],
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar menu admin"
            onClick={onMobileClose}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
            <SidebarBody
              tenantSlug={tenantSlug}
              items={items}
              pathname={pathname}
              isSuperAdmin={isSuperAdmin}
              torcidas={torcidas}
              onNavigate={onMobileClose}
            />
          </aside>
        </div>
      )}

      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] lg:flex">
        <SidebarBody
          tenantSlug={tenantSlug}
          items={items}
          pathname={pathname}
          isSuperAdmin={isSuperAdmin}
          torcidas={torcidas}
        />
      </aside>
    </>
  )
}
