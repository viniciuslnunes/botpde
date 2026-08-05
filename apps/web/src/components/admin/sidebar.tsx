'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Handshake,
  ShoppingBag,
  Settings,
  Calendar,
  MessagesSquare,
  Wallet,
  Landmark,
  Beer,
  Receipt,
  ChevronRight,
  Bus,
  Drum,
  PartyPopper,
  Venus,
  Drama,
  Briefcase,
  Network,
  type LucideIcon,
} from 'lucide-react'
import { groupAdminMenuBySecao } from '@torcida/types'
import { AdminSuperContextSwitchers } from '@/components/admin/admin-super-context-switchers'
import { TorcidaContextSwitcher } from '@/components/torcida-context-switcher'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'
import { ThemeToggle } from '@/components/theme-toggle'

/** Ícone por id do item de menu (ADMIN_MENU vem de @torcida/types, sem depender de React). */
const ICON_BY_ID: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  estrutura: Building2,
  torcedores: Users,
  membros: Users,
  socios: CreditCard,
  departamentos: Network,
  eventos: Calendar,
  caravanas: Bus,
  bateria: Drum,
  social: PartyPopper,
  feminino: Venus,
  carnaval: Drama,
  diretoria: Briefcase,
  loja: ShoppingBag,
  bar: Beer,
  'bar-pdv': Receipt,
  comunidade: MessagesSquare,
  financeiro: Wallet,
  patrimonio: Landmark,
  aliancas: Handshake,
  relatorios: BarChart3,
  plataforma: Settings,
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
  tenantId: string
  /** Itens já filtrados pelas permissões efetivas do usuário (ver ADMIN_MENU/filterMenuByPermissions) */
  items: AdminMenuItem[]
  /** Contagens de notificações não lidas por id de menu. */
  badges?: Record<string, number>
  isSuperAdmin?: boolean
  torcidas?: TorcidaOpcao[]
  clubes?: ClubeOpcao[]
  unidades?: UnidadeOpcao[]
  /** Vínculos de sócio APROVADO do usuário comum (não super-admin) em mais de uma torcida. */
  vinculos?: TorcidaOpcao[]
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
                'app-action group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
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
  tenantId,
  items,
  badges,
  pathname,
  isSuperAdmin,
  torcidas,
  clubes,
  unidades,
  vinculos,
  onNavigate,
}: {
  tenantSlug: string
  tenantId: string
  items: AdminMenuItem[]
  badges: Record<string, number>
  pathname: string
  isSuperAdmin: boolean
  torcidas: TorcidaOpcao[]
  clubes: ClubeOpcao[]
  unidades: UnidadeOpcao[]
  vinculos: TorcidaOpcao[]
  onNavigate?: () => void
}) {
  return (
    <>
      {isSuperAdmin && torcidas.length > 0 && (
        <div className="border-b border-[rgb(var(--border))] px-4 py-3">
          <AdminSuperContextSwitchers
            clubes={clubes}
            torcidas={torcidas}
            unidades={unidades}
            torcidaAtualSlug={tenantSlug}
            tenantAtualId={tenantId}
            variant="admin"
          />
        </div>
      )}

      {!isSuperAdmin && vinculos.length > 1 && (
        <div className="border-b border-[rgb(var(--border))] px-4 py-3">
          <p className="mb-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Torcida ativa
          </p>
          <TorcidaContextSwitcher torcidas={vinculos} atualSlug={tenantSlug} destino="admin" />
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
  tenantId,
  items,
  badges = {},
  isSuperAdmin = false,
  torcidas = [],
  clubes = [],
  unidades = [],
  vinculos = [],
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Trava o scroll do body enquanto o drawer mobile está aberto.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  // Portal no body: o shell admin tem overflow-hidden e clipava o
  // `position:fixed` do drawer — no mobile o menu “abria” sem aparecer.
  const mobileDrawer =
    mounted && mobileOpen
      ? createPortal(
          <div className="fixed inset-x-0 bottom-0 top-14 z-[60] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/35"
              aria-label="Fechar menu admin"
              onClick={onMobileClose}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
              <SidebarBody
                tenantSlug={tenantSlug}
                tenantId={tenantId}
                items={items}
                badges={badges}
                pathname={pathname}
                isSuperAdmin={isSuperAdmin}
                torcidas={torcidas}
                clubes={clubes}
                unidades={unidades}
                vinculos={vinculos}
                onNavigate={onMobileClose}
              />
            </aside>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {mobileDrawer}

      {/* z-60 > header (z-50) e StickyPersistBar (z-20): backdrops
          `fixed inset-0` dentro do header (sino/dropdown) não podem “matar”
          o menu — sintoma clássico pós-Estoque até dar F5. */}
      <aside className="relative z-[60] hidden h-full w-64 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] lg:flex">
        <SidebarBody
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          items={items}
          badges={badges}
          pathname={pathname}
          isSuperAdmin={isSuperAdmin}
          torcidas={torcidas}
          clubes={clubes}
          unidades={unidades}
          vinculos={vinculos}
        />
      </aside>
    </>
  )
}
