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
  Package,
  Settings,
  Calendar,
  KeyRound,
  MessagesSquare,
  ShieldAlert,
  Newspaper,
  Network,
  ScrollText,
  Wallet,
  Landmark,
  Palette,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { groupAdminMenuBySecao } from '@torcida/types'
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
  'loja-pedidos': Package,
  comunidade: MessagesSquare,
  'comunidade-moderacao': ShieldAlert,
  noticias: Newspaper,
  financeiro: Wallet,
  patrimonio: Landmark,
  aliancas: Handshake,
  acessos: KeyRound,
  auditoria: ScrollText,
  design: Palette,
  configuracoes: Settings,
}

interface AdminMenuItem {
  id: string
  label: string
  href: string
  secao?: string
  exact?: boolean
}

interface AdminSidebarProps {
  tenantSlug: string
  /** Itens já filtrados pelas permissões efetivas do usuário (ver ADMIN_MENU/filterMenuByPermissions) */
  items: AdminMenuItem[]
  /** Contagens de notificações não lidas por id de menu. */
  badges?: Record<string, number>
  isSuperAdmin?: boolean
  torcidas?: TorcidaOpcao[]
  mobileOpen?: boolean
  onMobileClose?: () => void
}

interface NavItemsProps {
  items: AdminMenuItem[]
  badges: Record<string, number>
  pathname: string
  onNavigate?: () => void
}

function isItemActive(item: AdminMenuItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

function formatBadgeCount(n: number) {
  return n > 9 ? '9+' : String(n)
}

function NavItems({ items, badges, pathname, onNavigate }: NavItemsProps) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isItemActive(item, pathname)
        const Icon = ICON_BY_ID[item.id] ?? LayoutDashboard
        const badgeCount = badges[item.id] ?? 0
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={[
                'app-action group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              <Icon
                className={[
                  'h-4 w-4 shrink-0 transition-colors',
                  active
                    ? 'text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {badgeCount > 0 ? (
                <span
                  className="min-w-4 shrink-0 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white"
                  aria-label={`${badgeCount} notificações pendentes`}
                >
                  {formatBadgeCount(badgeCount)}
                </span>
              ) : (
                active && <ChevronRight className="h-3 w-3 shrink-0 text-[rgb(var(--color-primary-fg))]" />
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function NavSections({
  items,
  badges,
  pathname,
  onNavigate,
}: {
  items: AdminMenuItem[]
  badges: Record<string, number>
  pathname: string
  onNavigate?: () => void
}) {
  const groups = groupAdminMenuBySecao(items)

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.id}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              {group.label}
            </p>
          ) : null}
          <NavItems
            items={group.items as AdminMenuItem[]}
            badges={badges}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        </div>
      ))}
    </div>
  )
}

function SidebarBody({
  tenantSlug,
  items,
  badges,
  pathname,
  isSuperAdmin,
  torcidas,
  onNavigate,
}: {
  tenantSlug: string
  items: AdminMenuItem[]
  badges: Record<string, number>
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

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu administrativo">
        <NavSections items={items} badges={badges} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-1 border-t border-[rgb(var(--border))] px-3 py-3 lg:hidden">
        <ThemeToggle variant="row" />
        <Link
          href="/portal/comunidade"
          onClick={onNavigate}
          className="app-action flex items-center rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          Voltar ao portal
        </Link>
      </div>

      <div className="hidden border-t border-[rgb(var(--border))] px-3 py-3 lg:block">
        <Link
          href="/portal/comunidade"
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
  badges = {},
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
              badges={badges}
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
          badges={badges}
          pathname={pathname}
          isSuperAdmin={isSuperAdmin}
          torcidas={torcidas}
        />
      </aside>
    </>
  )
}
