'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Briefcase,
  CreditCard,
  Calendar,
  ShoppingBag,
  Users,
  MapPin,
  MessageCircle,
  Lock,
  UserCircle2,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react'
import { NotificationBell } from '@/components/portal/notification-bell'
import { markNavbarNotificationRead, refreshNavbarContext } from '@/lib/use-navbar-context'
import { useNavbarContext } from '@/lib/use-navbar-context'
import { useNavbarBrandOverride } from '@/lib/navbar-brand-override'
import Image from 'next/image'
import { NavPendingProvider } from '@/components/portal/nav-pending-context'
import { PortalNavLink } from '@/components/portal/portal-nav-link'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { LogoImage } from '@/components/media/logo-image'
import { ThemeToggle } from '@/components/theme-toggle'

/** Barra principal do portal. Áreas (Caravanas, Bateria, Financeiro, Mensalidades…)
 * NÃO entram aqui — ficam no hub `/portal/departamentos` → `/portal/departamentos/[slug]`.
 * Landing pós-auth: Comunidade (`/portal/comunidade`). */
const navLinks = [
  { href: '/portal/comunidade', label: 'Comunidade', icon: Users, prefetch: 'hover' as const },
  { href: '/portal/carteirinha', label: 'Carteirinha', icon: CreditCard, prefetch: 'hover' as const },
  { href: '/portal/eventos', label: 'Agenda', icon: Calendar, prefetch: 'hover' as const },
  { href: '/portal/sedes', label: 'Sedes', icon: MapPin, prefetch: 'hover' as const },
  { href: '/portal/loja', label: 'Loja', icon: ShoppingBag, prefetch: 'hover' as const },
] as const

/** Torcedor global (CN sem vínculo) — seções por tenant ficariam vazias. */
const LINKS_SOMENTE_TORCIDA = new Set([
  '/portal/carteirinha',
  '/portal/eventos',
  '/portal/sedes',
  '/portal/loja',
])

/** Torcedor vinculado à sede/unidade (convite): sem carteirinha. */
const LINKS_OCULTOS_TORCEDOR_VINCULO = new Set(['/portal/carteirinha'])

/**
 * Agenda/Sedes/Loja são do canal (torcida/unidade). Na CN somem da topbar —
 * sócio e torcedor — e voltam ao abrir a aba do canal.
 */
const LINKS_REATIVOS_CANAL = new Set([
  '/portal/eventos',
  '/portal/sedes',
  '/portal/loja',
])

/** Único atalho de departamentos na navbar (não lista cada área). */
const departamentosLink = {
  href: '/portal/departamentos',
  label: 'Departamentos',
  icon: Briefcase,
  prefetch: 'hover' as const,
}

interface PortalNavbarProps {
  userName: string | null
  userAvatar: string | null
  /** Torcida ativa ou, no modo nacional, o clube (nome/escudo). */
  tenant: { nome: string; corPrimaria: string; logoUrl: string | null }
  temDepartamentos?: boolean
  /** Comunidade do clube sem torcida ativa no cookie (`getActiveTenant` null). */
  modoNacional?: boolean
  /**
   * Torcedor APROVADO na sede/unidade (convite). Com `modoNacional`, libera
   * Loja/Sedes/Agenda fora da CN (aba torcida/unidade) e continua sem
   * Carteirinha/Departamentos.
   */
  temVinculoTorcida?: boolean
  /** Slug da torcida ativa — só preenchido no modo torcida. */
  tenantSlugAtual?: string | null
}

export function PortalNavbar({
  userName,
  userAvatar,
  tenant,
  temDepartamentos = false,
  modoNacional = false,
  temVinculoTorcida = false,
  tenantSlugAtual = null,
}: PortalNavbarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { unreadMessages, unreadNotifications, hasAdminAreaAccess, notifications } =
    useNavbarContext()
  const { override: brandOverride, escopoAtivo } = useNavbarBrandOverride()
  // Override cosmético (visão de canal): substitui só o slot esquerdo, sem
  // afetar sessão/tenant ativo/permissões.
  const brandTenant = brandOverride ?? tenant
  const [menuOpen, setMenuOpen] = useState(false)
  const [userDropOpen, setUserDropOpen] = useState(false)

  // O layout do portal não remonta ao trocar de torcida (redirect client-side
  // dentro da mesma rota) — o cache de 20s de useNavbarContext (hasAdminAreaAccess
  // etc.) ficaria com o snapshot da torcida anterior até o próximo poll. Força
  // um refresh assim que o slug ativo muda.
  const primeiroTenantSlug = useRef(tenantSlugAtual)
  useEffect(() => {
    if (primeiroTenantSlug.current === tenantSlugAtual) return
    primeiroTenantSlug.current = tenantSlugAtual
    void refreshNavbarContext(true)
    // A troca já concluiu (chegamos na nova torcida) — fecha os menus em vez
    // de deixá-los presos abertos, já que o layout não remonta na navegação.
    setUserDropOpen(false)
    setMenuOpen(false)
  }, [tenantSlugAtual])

  const firstName = userName?.split(' ')[0] ?? 'Torcedor'

  // CN: sem cadeado admin e sem Agenda/Sedes/Loja. Fonte de verdade = escopo
  // do chrome da comunidade (mesmo resolver da marca); URL só como fallback.
  const naComunidade = pathname.startsWith('/portal/comunidade')
  const escopoParam = searchParams.get('escopo')
  const emEscopoNacional =
    escopoAtivo === 'nacional' ||
    (escopoAtivo == null &&
      naComunidade &&
      (escopoParam === 'nacional' ||
        (modoNacional && (escopoParam == null || escopoParam === ''))))
  const mostrarCadeadoAdmin = hasAdminAreaAccess && !emEscopoNacional

  const ocultosNacional = temVinculoTorcida
    ? LINKS_OCULTOS_TORCEDOR_VINCULO
    : LINKS_SOMENTE_TORCIDA
  const baseLinks = modoNacional
    ? navLinks.filter((link) => !ocultosNacional.has(link.href))
    : [...navLinks]
  // Departamentos: só sócio com área (temDepartamentos). Torcedor do convite
  // nunca entra — layout já passa 0 no modo nacional.
  const linksComDepto = temDepartamentos
    ? [baseLinks[0]!, departamentosLink, ...baseLinks.slice(1)]
    : [...baseLinks]
  const links = emEscopoNacional
    ? linksComDepto.filter((link) => !LINKS_REATIVOS_CANAL.has(link.href))
    : linksComDepto

  // Abaixo de xl: ícones de Loja/Sedes/Agenda na faixa de ações (só quando
  // o canal está ativo — some junto com os labels na CN).
  const atalhosTopbarMobile = links.filter((link) =>
    link.href === '/portal/eventos' ||
    link.href === '/portal/sedes' ||
    link.href === '/portal/loja',
  )

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  function linkClass(active: boolean) {
    return [
      'app-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
      active
        ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
        : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
    ].join(' ')
  }

  function mobileLinkClass(active: boolean) {
    return [
      'app-action flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
        : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
    ].join(' ')
  }

  const adminIconClass = [
    'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
    pathname.startsWith('/admin')
      ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
  ].join(' ')

  return (
    <NavPendingProvider>
      <header className="relative sticky top-0 z-40 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] backdrop-blur-sm">
        <div className="app-container flex h-14 items-center gap-4">

          <PortalNavLink href="/portal/comunidade" className="flex min-w-0 shrink items-center gap-2" showSpinner={false}>
            {brandTenant.logoUrl ? (
              <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                <LogoImage
                  src={brandTenant.logoUrl}
                  alt={brandTenant.nome}
                  fill
                  sizes="32px"
                  quality={95}
                  className="object-contain"
                />
              </span>
            ) : (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: brandTenant.corPrimaria }}
              >
                {brandTenant.nome.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="hidden truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))] sm:block sm:max-w-[10rem] lg:max-w-[14rem]">
              {brandTenant.nome}
            </span>
          </PortalNavLink>

          <nav className="app-scrollbar-none hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] xl:flex [&::-webkit-scrollbar]:hidden">
            {links.map((link) => {
              const Icon = link.icon
              const active = isActive(link.href)
              return (
                <PortalNavLink
                  key={link.href}
                  href={link.href}
                  prefetch={link.prefetch}
                  className={linkClass(active)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </PortalNavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {atalhosTopbarMobile.map((link) => {
              const Icon = link.icon
              const active = isActive(link.href)
              return (
                <PortalNavLink
                  key={link.href}
                  href={link.href}
                  prefetch={link.prefetch}
                  aria-label={link.label}
                  title={link.label}
                  className={[
                    'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors xl:hidden',
                    active
                      ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                  showSpinner={false}
                >
                  <Icon className="h-4 w-4" />
                </PortalNavLink>
              )
            })}
            <PortalNavLink
              href="/portal/mensagens"
              prefetch="hover"
              aria-label={
                unreadMessages > 0
                  ? `Mensagens (${unreadMessages} não lidas)`
                  : 'Mensagens'
              }
              className={[
                'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                pathname.startsWith('/portal/mensagens')
                  ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
              showSpinner={false}
            >
              <MessageCircle className="h-4 w-4" />
              {unreadMessages > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] px-1 text-[10px] font-bold text-[rgb(var(--color-primary-on))]">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </PortalNavLink>
            <NotificationBell
              initialItems={notifications}
              unreadCount={unreadNotifications}
              onMarkRead={markNavbarNotificationRead}
            />
            {mostrarCadeadoAdmin && (
              <Link
                href="/admin"
                prefetch={false}
                aria-label="Área administrativa"
                title="Área administrativa"
                className={adminIconClass}
              >
                <Lock className="h-4 w-4" />
              </Link>
            )}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            <div className="relative hidden xl:block">
              <button
                onClick={() => setUserDropOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-raised))]"
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
                    <img src={userAvatar} alt={firstName} className="h-5 w-5 rounded-full object-cover" />
                  )
                ) : (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: tenant.corPrimaria }}
                  >
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="block truncate" style={{ maxWidth: '9rem' }}>
                  {firstName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]" />
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

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="app-action flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] xl:hidden"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 pb-4 pt-2 xl:hidden">
            <div className="mb-3 flex items-center gap-3 py-2">
              {userAvatar ? (
                canOptimizeImageUrl(userAvatar) ? (
                  <Image
                    src={userAvatar}
                    alt={firstName}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userAvatar} alt={firstName} className="h-8 w-8 rounded-full object-cover" />
                )
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: tenant.corPrimaria }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-[rgb(var(--foreground))]">{firstName}</span>
            </div>
            <nav className="space-y-1">
              <PortalNavLink
                href="/portal/mensagens"
                prefetch="hover"
                onClick={() => setMenuOpen(false)}
                className={mobileLinkClass(pathname.startsWith('/portal/mensagens'))}
              >
                <MessageCircle className="h-4 w-4" />
                Mensagens
                {unreadMessages > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] px-1.5 text-[11px] font-bold text-[rgb(var(--color-primary-on))]">
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
              </PortalNavLink>
              {links.map((link) => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                  <PortalNavLink
                    key={link.href}
                    href={link.href}
                    prefetch={link.prefetch}
                    onClick={() => setMenuOpen(false)}
                    className={mobileLinkClass(active)}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </PortalNavLink>
                )
              })}
              <ThemeToggle variant="row" />
              <button
                onClick={() => signOut({ callbackUrl: '/entrar' })}
                className="app-action flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </nav>
          </div>
        )}
      </header>
    </NavPendingProvider>
  )
}
