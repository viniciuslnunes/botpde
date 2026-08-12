'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LogOut, Menu, Shield, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { AdminSuperContextSwitchers } from '@/components/admin/admin-super-context-switchers'
import { SuperAdminNav } from '@/components/super-admin/super-admin-nav'
import { AppBuildMetaSidebar } from '@/components/super-admin/app-build-meta'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'

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
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          <Shield className="h-3.5 w-3.5" />
          Super Admin
        </p>
        <p className="mt-1 text-sm font-medium text-[rgb(var(--foreground))]">Torcida SaaS</p>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SuperAdminNav onNavigate={onNavigate} badges={badges} />
      </div>

      <div className="border-t border-[rgb(var(--border))]">
        <AppBuildMetaSidebar />
        <div className="space-y-1 px-3 pb-3 lg:hidden">
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
}: {
  mobileOpen: boolean
  onToggleMobile: () => void
  userName: string | null
  userEmail: string | null
}) {
  const [userDropOpen, setUserDropOpen] = useState(false)
  const pathname = usePathname()
  const firstName = userName?.split(' ')[0] ?? 'Operador'

  useEffect(() => {
    setUserDropOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] backdrop-blur-sm">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onToggleMobile}
          className="app-action flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] lg:hidden"
          aria-label={mobileOpen ? 'Fechar menu super admin' : 'Abrir menu super admin'}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <Link href="/super-admin/torcidas" className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))]">
              Super Admin
            </p>
            <p className="hidden text-[11px] text-[rgb(var(--foreground-muted))] sm:block">
              Operação da plataforma
            </p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setUserDropOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-raised))]"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-[10px] font-bold text-[rgb(var(--color-primary-fg))]">
                {firstName.charAt(0).toUpperCase()}
              </div>
              <span className="inline-block max-w-[110px] truncate lg:max-w-[160px]">{firstName}</span>
            </button>

            {userDropOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserDropOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
                  {userEmail && (
                    <p className="truncate px-4 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                      {userEmail}
                    </p>
                  )}
                  <div className="my-1 border-t border-[rgb(var(--border))]" />
                  <Link
                    href="/portal/comunidade"
                    onClick={() => setUserDropOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    Voltar ao portal
                  </Link>
                  <button
                    type="button"
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const switcher = torcidas.length > 0 && (
    <div className="border-t border-[rgb(var(--border))] px-4 py-3">
      <AdminSuperContextSwitchers
        clubes={clubes}
        torcidas={torcidas}
        unidades={unidades}
        torcidaAtualSlug={torcidaAtualSlug}
        tenantAtualId={tenantAtualId}
        destino="admin"
        variant="admin"
      />
    </div>
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
  children,
}: SuperAdminShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <SuperAdminTopbar
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen((v) => !v)}
        userName={userName}
        userEmail={userEmail}
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
