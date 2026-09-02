'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  ChevronDown,
  LogOut,
  Menu,
  Shield,
  UserCircle2,
  Users,
  X,
} from 'lucide-react'
import {
  NotificationBell,
  type NotificationItem,
} from '@/components/portal/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { LogoMiniatura } from '@/components/media/logo-miniatura'
import { useAdminNavbarContext, markAdminNavbarNotificationRead } from '@/lib/use-admin-navbar-context'
import { AdminSidebar } from '@/components/admin/sidebar'
import { TenantDesignBridge } from '@/components/tenant-design-bridge'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'
import { AppButton } from '@/components/ui/button'

interface AdminMenuItem {
  id: string
  label: string
  href: string
  secao?: string
  exact?: boolean
}

interface AdminShellProps {
  tenantNome: string
  tenantCor: string
  tenantSlug: string
  tenantId: string
  tenantLogoUrl: string | null
  /** JSON de tema visual (Tenant.design). */
  tenantDesign?: unknown
  tenantCorArquirrival?: string | null
  userName: string | null
  userAvatar: string | null
  items: AdminMenuItem[]
  isSuperAdmin?: boolean
  torcidas?: TorcidaOpcao[]
  clubes?: ClubeOpcao[]
  unidades?: UnidadeOpcao[]
  /** Vínculos de sócio APROVADO do usuário comum (não super-admin) em mais de uma torcida. */
  vinculos?: TorcidaOpcao[]
  notifications?: NotificationItem[]
  /** Banner do super-admin acima do conteúdo. */
  operatorBanner?: React.ReactNode
  children: React.ReactNode
}

function AdminTopbar({
  tenantNome,
  tenantCor,
  tenantSlug,
  tenantLogoUrl,
  userName,
  userAvatar,
  notifications,
  unreadNotifications,
  mobileOpen,
  onToggleMobile,
  isSuperAdmin,
}: {
  tenantNome: string
  tenantCor: string
  tenantSlug: string
  tenantLogoUrl: string | null
  userName: string | null
  userAvatar: string | null
  notifications: NotificationItem[]
  unreadNotifications: number
  mobileOpen: boolean
  onToggleMobile: () => void
  isSuperAdmin: boolean
}) {
  const [userDropOpen, setUserDropOpen] = useState(false)
  const userDropRef = useRef<HTMLDivElement>(null)
  const firstName = userName?.split(' ')[0] ?? 'Admin'
  const pathname = usePathname()

  // Soft-nav não remonta o shell: fecha o dropdown ao navegar. No render — em
  // effect ele sobrevive um frame aberto sobre a página nova.
  const [pathnameSincronizado, setPathnameSincronizado] = useState(pathname)
  if (pathname !== pathnameSincronizado) {
    setPathnameSincronizado(pathname)
    setUserDropOpen(false)
  }

  // pointerdown (não backdrop): o header tem `backdrop-blur`, que vira bloco
  // contentor de `position: fixed` — um `fixed inset-0` aqui cobriria só a
  // faixa do header, e o clique no corpo da página não fechava o menu.
  useEffect(() => {
    if (!userDropOpen) return
    function onPointerDown(e: PointerEvent) {
      if (userDropRef.current?.contains(e.target as Node)) return
      setUserDropOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserDropOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [userDropOpen])

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] backdrop-blur-sm">
      <div className="app-inset-x flex h-14 items-center gap-3 sm:[--app-inset-x:1.5rem]">
        <button
          type="button"
          onClick={onToggleMobile}
          className="app-action flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] lg:hidden"
          aria-label={mobileOpen ? 'Fechar menu admin' : 'Abrir menu admin'}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <Link href="/admin" className="app-touch-target flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          {tenantLogoUrl ? (
            <LogoMiniatura
              src={tenantLogoUrl}
              alt={tenantNome}
              className="rounded-lg"
              rounded="rounded-lg"
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: tenantCor }}
            >
              {tenantNome.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))]">
              {tenantNome}
            </p>
            <p className="portal-kicker hidden text-[rgb(var(--foreground-muted))] sm:block">
              Administração
            </p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell
            key={tenantSlug}
            initialItems={notifications}
            unreadCount={unreadNotifications}
            verTodasHref="/admin/notificacoes"
            verTodasLabel="Ver alertas operacionais"
            onMarkRead={markAdminNavbarNotificationRead}
          />

          <div ref={userDropRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setUserDropOpen((v) => !v)}
              className="app-action flex h-9 items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-raised))]"
            >
              {userAvatar ? (
                canOptimizeImageUrl(userAvatar) ? (
                  <Image
                    src={userAvatar}
                    alt={firstName}
                    width={20}
                    height={20}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userAvatar}
                    alt={firstName}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                )
              ) : (
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: tenantCor }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="inline-block max-w-[110px] truncate lg:max-w-[160px]">{firstName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]" />
            </button>

            {userDropOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
                <Link
                  href="/portal/perfil"
                  onClick={() => setUserDropOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  <UserCircle2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                  Meu Perfil
                </Link>
                <Link
                  href="/portal/comunidade"
                  onClick={() => setUserDropOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  <Users className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                  Voltar ao portal
                </Link>
                {isSuperAdmin && (
                  <Link
                    href="/super-admin"
                    prefetch={false}
                    onClick={() => setUserDropOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <Shield className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    Área Super Admin
                  </Link>
                )}
                <ThemeToggle variant="dropdown" />
                <div className="my-1 border-t border-[rgb(var(--border))]" />
                <p className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
                  <Shield className="h-3.5 w-3.5 text-[rgb(var(--color-primary-fg))]" />
                  Área Admin
                </p>
                <AppButton
                  variant="none"
                  icon={LogOut}
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/entrar' })}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Sair
                </AppButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export function AdminShell({
  tenantNome,
  tenantCor,
  tenantSlug,
  tenantId,
  tenantLogoUrl,
  tenantDesign,
  tenantCorArquirrival = null,
  userName,
  userAvatar,
  items,
  isSuperAdmin = false,
  torcidas = [],
  clubes = [],
  unidades = [],
  vinculos = [],
  notifications = [],
  operatorBanner,
  children,
}: AdminShellProps) {
  const pathname = usePathname()
  const immersivePdv = pathname === '/admin/bar/pdv'
  const [mobileOpen, setMobileOpen] = useState(false)
  const {
    notifications: liveNotifications,
    unreadNotifications,
    menuBadges,
  } = useAdminNavbarContext(notifications)

  // Fecha o drawer ao navegar, no render (em effect ele fica aberto por um
  // frame sobre a página nova).
  const [pathnameDrawer, setPathnameDrawer] = useState(pathname)
  if (pathname !== pathnameDrawer) {
    setPathnameDrawer(pathname)
    setMobileOpen(false)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TenantDesignBridge
        corPrimaria={tenantCor}
        design={tenantDesign}
        slug={tenantSlug}
        corArquirrival={tenantCorArquirrival}
      />
      {!immersivePdv && (
        <AdminTopbar
          tenantNome={tenantNome}
          tenantCor={tenantCor}
          tenantSlug={tenantSlug}
          tenantLogoUrl={tenantLogoUrl}
          userName={userName}
          userAvatar={userAvatar}
          notifications={liveNotifications}
          unreadNotifications={unreadNotifications}
          mobileOpen={mobileOpen}
          onToggleMobile={() => setMobileOpen((v) => !v)}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!immersivePdv && (
          <AdminSidebar
            tenantSlug={tenantSlug}
            tenantId={tenantId}
            items={items}
            badges={menuBadges}
            isSuperAdmin={isSuperAdmin}
            torcidas={torcidas}
            clubes={clubes}
            unidades={unidades}
            vinculos={vinculos}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}

        <main
          className={[
            'app-shell-bg min-h-0 min-w-0 flex-1',
            immersivePdv ? 'h-full overflow-hidden' : 'overflow-auto',
          ].join(' ')}
        >
          {/* Fragment único evita lista de irmãos sem key (banner vem do Server Layout). */}
          {immersivePdv ? (
            children
          ) : (
            <>
              {operatorBanner}
              {children}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
