'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Lock, LogOut, Menu, Shield, UserCircle2, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { AdminSuperContextSwitchers } from '@/components/admin/admin-super-context-switchers'
import { AdminContextDisclosure } from '@/components/admin/admin-context-disclosure'
import { SuperAdminNav } from '@/components/super-admin/super-admin-nav'
import { AppBuildMetaSidebar } from '@/components/super-admin/app-build-meta'
import {
  NotificationBell,
  type NotificationItem,
} from '@/components/portal/notification-bell'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'
import { useHidratado } from '@/lib/use-hidratado'
import {
  markSuperAdminNavbarNotificationRead,
  useSuperAdminNavbarContext,
} from '@/lib/use-super-admin-navbar-context'

interface SuperAdminBadges {
  afiliacoes: number
  moderacao: number
}

interface SuperAdminShellProps {
  userName: string | null
  userEmail: string | null
  torcidaAtualSlug: string | null
  tenantAtualId: string | null
  torcidas: TorcidaOpcao[]
  clubes: ClubeOpcao[]
  unidades: UnidadeOpcao[]
  badges?: SuperAdminBadges
  notifications?: NotificationItem[]
  children: React.ReactNode
}

function SidebarBody({
  onNavigate,
  badges,
}: {
  onNavigate?: () => void
  badges?: SuperAdminBadges
}) {
  return (
    <>
      <div className="border-b border-[rgb(var(--border))] px-4 py-4">
        <p className="portal-kicker flex items-center gap-2 text-[rgb(var(--foreground-muted))]">
          <Shield className="h-3.5 w-3.5" />
          Super Admin
        </p>
        <p className="mt-1 text-sm font-semibold text-[rgb(var(--foreground))]">Torcida SaaS</p>
      </div>

      <div className="app-scrollbar-fina app-scrollbar-idle flex-1 overflow-y-auto py-4">
        <SuperAdminNav onNavigate={onNavigate} badges={badges} />
      </div>

      <div className="border-t border-[rgb(var(--border))]">
        <AppBuildMetaSidebar />
        <div className="space-y-1 px-3 pb-3 lg:hidden">
          <Link
            href="/portal/perfil"
            onClick={onNavigate}
            className="app-action flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <UserCircle2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Meu Perfil
          </Link>
          <Link
            href="/admin"
            prefetch={false}
            onClick={onNavigate}
            className="app-action flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <Lock className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Área administrativa
          </Link>
          <Link
            href="/super-admin"
            prefetch={false}
            onClick={onNavigate}
            className="app-action flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <Shield className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Área Super Admin
          </Link>
          <ThemeToggle variant="row" />
        </div>
      </div>
    </>
  )
}

function SuperAdminTopbar({
  mobileOpen,
  onToggleMobile,
  userName,
  userEmail,
  notifications,
  unreadNotifications,
}: {
  mobileOpen: boolean
  onToggleMobile: () => void
  userName: string | null
  userEmail: string | null
  notifications: NotificationItem[]
  unreadNotifications: number
}) {
  const [userDropOpen, setUserDropOpen] = useState(false)
  const userDropRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const firstName = userName?.split(' ')[0] ?? 'Operador'
  const dropItemClass =
    'app-action flex w-full items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'

  // Fecha o dropdown ao navegar, no render — em effect ele sobrevive um frame
  // aberto sobre a página nova.
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
          aria-label={mobileOpen ? 'Fechar menu super admin' : 'Abrir menu super admin'}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <Link href="/super-admin/torcidas" className="app-touch-target flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))]">
              Super Admin
            </p>
            <p className="portal-kicker hidden text-[rgb(var(--foreground-muted))] sm:block">
              Operação da plataforma
            </p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell
            initialItems={notifications}
            unreadCount={unreadNotifications}
            verTodasHref="/super-admin/moderacao"
            verTodasLabel="Ver denúncias da plataforma"
            onMarkRead={markSuperAdminNavbarNotificationRead}
          />

          <div ref={userDropRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setUserDropOpen((v) => !v)}
              className="app-action flex h-9 items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-raised))]"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-[10px] font-bold text-[rgb(var(--color-primary-fg))]">
                {firstName.charAt(0).toUpperCase()}
              </div>
              <span className="inline-block max-w-[110px] truncate lg:max-w-[160px]">{firstName}</span>
            </button>

            {userDropOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
                {userEmail && (
                  <>
                    <p className="truncate px-4 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                      {userEmail}
                    </p>
                    <div className="my-1 border-t border-[rgb(var(--border))]" />
                  </>
                )}
                <Link
                  href="/portal/perfil"
                  onClick={() => setUserDropOpen(false)}
                  className={dropItemClass}
                >
                  <UserCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                  Meu Perfil
                </Link>
                <Link
                  href="/admin"
                  prefetch={false}
                  onClick={() => setUserDropOpen(false)}
                  className={dropItemClass}
                >
                  <Lock className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                  Área administrativa
                </Link>
                <Link
                  href="/super-admin"
                  prefetch={false}
                  onClick={() => setUserDropOpen(false)}
                  className={dropItemClass}
                >
                  <Shield className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                  Área Super Admin
                </Link>
                <ThemeToggle variant="dropdown" />
                <div className="my-1 border-t border-[rgb(var(--border))]" />
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/entrar' })}
                  className="app-action flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function SuperAdminSidebar({
  mobileOpen,
  onMobileClose,
  torcidaAtualSlug,
  tenantAtualId,
  torcidas,
  clubes,
  unidades,
  badges,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
  torcidaAtualSlug: string | null
  tenantAtualId: string | null
  torcidas: TorcidaOpcao[]
  clubes: ClubeOpcao[]
  unidades: UnidadeOpcao[]
  badges?: SuperAdminBadges
}) {
  const mounted = useHidratado()

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const switcher = torcidas.length > 0 && (
    <AdminContextDisclosure placement="bottom">
      <AdminSuperContextSwitchers
        clubes={clubes}
        torcidas={torcidas}
        unidades={unidades}
        torcidaAtualSlug={torcidaAtualSlug}
        tenantAtualId={tenantAtualId}
        destino="admin"
        variant="admin"
      />
    </AdminContextDisclosure>
  )

  const mobileDrawer =
    mounted && mobileOpen
      ? createPortal(
          <div className="fixed inset-x-0 bottom-0 top-14 z-[60] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/35"
              aria-label="Fechar menu super admin"
              onClick={onMobileClose}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
              <SidebarBody onNavigate={onMobileClose} badges={badges} />
              {switcher}
            </aside>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {mobileDrawer}

      <aside className="relative z-[60] hidden h-full w-64 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] lg:flex">
        <SidebarBody badges={badges} />
        {switcher}
      </aside>
    </>
  )
}

export function SuperAdminShell({
  userName,
  userEmail,
  torcidaAtualSlug,
  tenantAtualId,
  torcidas,
  clubes,
  unidades,
  badges,
  notifications = [],
  children,
}: SuperAdminShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const {
    notifications: liveNotifications,
    unreadNotifications,
  } = useSuperAdminNavbarContext(notifications)

  // Fecha o drawer ao navegar, no render (em effect ele fica aberto por um
  // frame sobre a página nova).
  const [pathnameDrawer, setPathnameDrawer] = useState(pathname)
  if (pathname !== pathnameDrawer) {
    setPathnameDrawer(pathname)
    setMobileOpen(false)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SuperAdminTopbar
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen((v) => !v)}
        userName={userName}
        userEmail={userEmail}
        notifications={liveNotifications}
        unreadNotifications={unreadNotifications}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SuperAdminSidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          torcidaAtualSlug={torcidaAtualSlug}
          tenantAtualId={tenantAtualId}
          torcidas={torcidas}
          clubes={clubes}
          unidades={unidades}
          badges={badges}
        />

        <main className="app-shell-bg min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
