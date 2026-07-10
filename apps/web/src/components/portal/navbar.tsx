'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  CreditCard,
  Calendar,
  ShoppingBag,
  Users,
  MapPin,
  MessageCircle,
  Shield,
  UserCircle2,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react'
import { NotificationBell, type NotificationItem } from '@/components/portal/notification-bell'

const navLinks = [
  { href: '/portal/comunidade', label: 'Comunidade', icon: Users },
  { href: '/portal/carteirinha', label: 'Carteirinha', icon: CreditCard },
  { href: '/portal/eventos', label: 'Eventos', icon: Calendar },
  { href: '/portal/sedes', label: 'Sedes', icon: MapPin },
  { href: '/portal/loja', label: 'Loja', icon: ShoppingBag },
]

interface PortalNavbarProps {
  userName: string | null
  userAvatar: string | null
  tenantNome: string
  tenantCor: string
  isAdmin: boolean
  notifications: NotificationItem[]
  unreadMessages: number
}

export function PortalNavbar({
  userName,
  userAvatar,
  tenantNome,
  tenantCor,
  isAdmin,
  notifications,
  unreadMessages,
}: PortalNavbarProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userDropOpen, setUserDropOpen] = useState(false)

  const firstName = userName?.split(' ')[0] ?? 'Torcedor'

  function isActive(link: (typeof navLinks)[number]) {
    return pathname.startsWith(link.href)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo / Tenant */}
        <Link href="/portal/comunidade" className="flex shrink-0 items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: tenantCor }}
          >
            {tenantNome.charAt(0).toUpperCase()}
          </div>
          <span className="hidden text-sm font-semibold text-[rgb(var(--foreground))] sm:block">
            {tenantNome}
          </span>
        </Link>

        {/* Nav Links — desktop */}
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const Icon = link.icon
            const active = isActive(link)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/portal/mensagens"
            aria-label={
              unreadMessages > 0
                ? `Mensagens (${unreadMessages} não lidas)`
                : 'Mensagens'
            }
            className={[
              'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
              pathname.startsWith('/portal/mensagens')
                ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <MessageCircle className="h-4 w-4" />
            {unreadMessages > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1 text-[10px] font-bold text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </Link>
          <NotificationBell initialItems={notifications} />

          {/* User dropdown — desktop */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setUserDropOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-raised))]"
            >
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatar} alt={firstName} className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: tenantCor }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              {firstName}
              <ChevronDown className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
            </button>

            {userDropOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserDropOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
                  <Link
                    href="/portal/perfil"
                    onClick={() => setUserDropOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <UserCircle2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    Meu Perfil
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setUserDropOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
                      Área Admin
                    </Link>
                  )}
                  <div className="my-1 border-t border-[rgb(var(--border))]" />
                  <button
                    onClick={() => signOut({ callbackUrl: '/entrar' })}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Hamburger — mobile */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] md:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 pb-4 pt-2 md:hidden">
          <div className="mb-3 flex items-center gap-3 py-2">
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatar} alt={firstName} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: tenantCor }}
              >
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium text-[rgb(var(--foreground))]">{firstName}</span>
          </div>
          <nav className="space-y-1">
            <Link
              href="/portal/mensagens"
              onClick={() => setMenuOpen(false)}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/portal/mensagens')
                  ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              <MessageCircle className="h-4 w-4" />
              Mensagens
              {unreadMessages > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-[11px] font-bold text-white">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </Link>
            {navLinks.map((link) => {
              const Icon = link.icon
              const active = isActive(link)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={[
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              )
            })}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--primary))] transition-colors hover:bg-[rgb(var(--primary)_/_0.1)]"
              >
                <Shield className="h-4 w-4" />
                Área Admin
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/entrar' })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </nav>
        </div>
      )}
    </header>
  )
}
