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
  Shield,
  Menu,
  X,
  ChevronDown,
  UserPlus,
  Globe2,
  History,
} from 'lucide-react'
import { NotificationBell } from '@/components/portal/notification-bell'
import { markNavbarNotificationRead, refreshNavbarContext } from '@/lib/use-navbar-context'
import { useNavbarContext } from '@/lib/use-navbar-context'
import { useNavbarBrandOverride, type NavbarBrand } from '@/lib/navbar-brand-override'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import Image from 'next/image'
import { NavPendingProvider } from '@/components/portal/nav-pending-context'
import { PortalNavLink } from '@/components/portal/portal-nav-link'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { LogoMiniatura } from '@/components/media/logo-miniatura'
import { ThemeToggle } from '@/components/theme-toggle'
import { PendenciaBadge } from '@/components/pendencia-badge'
import { ScrollRail } from '@/components/ui/scroll-rail'
import type { PortalNavBadges } from '@/lib/notificacoes-menu-badges'

function badgeDaNav(href: string, badges: PortalNavBadges): number {
  if (href === '/portal/comunidade') return badges.comunidade
  if (href === '/portal/departamentos') return badges.departamentos
  if (href === '/portal/eventos') return badges.eventos
  if (href === '/portal/loja') return badges.loja
  if (href === '/portal/carteirinha') return badges.carteirinha
  if (href === '/portal/sedes') return badges.sedes
  return 0
}

/** Barra principal do portal. Áreas (Caravanas, Bateria, Financeiro, Mensalidades…)
 * NÃO entram aqui — ficam no hub `/portal/departamentos` → `/portal/departamentos/[slug]`.
 * Landing pós-auth: Comunidade (`/portal/comunidade`). */
const navLinks = [
  { href: '/portal/comunidade', label: 'Comunidade', icon: Users, prefetch: 'hover' as const },
  { href: '/portal/carteirinha', label: 'Carteirinha', icon: CreditCard, prefetch: 'hover' as const },
  { href: '/portal/eventos', label: 'Agenda', icon: Calendar, prefetch: 'hover' as const },
  { href: '/portal/sedes', label: 'Sedes', icon: MapPin, prefetch: 'hover' as const },
  { href: '/portal/loja', label: 'Lojas', icon: ShoppingBag, prefetch: 'hover' as const },
  // Memórias é menu como os demais (não ícone no cluster de chat/notificações);
  // continua visível na CN, onde o href leva `?escopo=clube`.
  { href: '/portal/memoria', label: 'Memórias', icon: History, prefetch: 'hover' as const },
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
 * Módulos do canal (torcida/unidade). Somem na CN e em canal temático/
 * público (`canalOficial: false`); voltam em escopo torcida/unidade ou
 * detalhe de canal oficial.
 */
const LINKS_REATIVOS_CANAL = new Set([
  '/portal/carteirinha',
  '/portal/departamentos',
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
  /**
   * Escopo persistido do canal (cookie `comunidade_escopo`, já revalidado no
   * layout). Fora de `/portal/comunidade` não existe `?escopo=` — é ele que
   * mantém a topbar no canal selecionado.
   */
  escopoCanal?: EscopoComunidade | null
  /** Marca do `escopoCanal` — slot esquerdo fora da Comunidade. */
  brandCanal?: NavbarBrand | null
  /**
   * CTA Associe-se, injetado **após Comunidade** (não no cluster da direita).
   * Null = oculto (já é sócio, sem clube no perfil, ou operador).
   * “Ver no Brasil” só entra no escopo da comunidade do clube (CN), nunca
   * no portal de uma torcida/unidade.
   */
  associeSe?: { href: string; label: string; pendente: boolean } | null
  /** Allowlist de e-mail — atalho para `/super-admin`. Sem isso o item some. */
  isSuperAdmin?: boolean
}

export function PortalNavbar({
  userName,
  userAvatar,
  tenant,
  temDepartamentos = false,
  modoNacional = false,
  temVinculoTorcida = false,
  tenantSlugAtual = null,
  escopoCanal = null,
  brandCanal = null,
  associeSe = null,
  isSuperAdmin = false,
}: PortalNavbarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { unreadMessages, unreadNotifications, hasAdminAreaAccess, notifications, navBadges } =
    useNavbarContext()
  const {
    override: brandOverride,
    escopoAtivo,
    ocultarModulosReativos,
  } = useNavbarBrandOverride()
  // Override cosmético (visão de canal): substitui só o slot esquerdo, sem
  // afetar sessão/tenant ativo/permissões. `brandCanal` cobre as rotas fora da
  // Comunidade, onde nenhum override monta — e evita o flash do escudo do
  // clube antes do chrome montar dentro dela.
  const brandTenant = brandOverride ?? brandCanal ?? tenant
  const [menuOpen, setMenuOpen] = useState(false)
  const [userDropOpen, setUserDropOpen] = useState(false)

  const userDropRef = useRef<HTMLDivElement>(null)

  // pointerdown (não backdrop): o header tem `backdrop-blur`, que vira bloco
  // contentor de `position: fixed` — um `fixed inset-0` aqui cobriria só a
  // faixa do header e o clique no corpo da página não fechava o menu.
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

  // CN / canal temático: sem módulos do canal (Carteirinha/Departamentos/
  // Agenda/Sedes/Loja). Cadeado admin segue só o escopo nacional. Dentro da
  // Comunidade a fonte de verdade é o escopo do chrome (mesmo resolver da
  // marca), com a URL como fallback até ele montar. Fora dela não existe
  // `?escopo=`: vale o cookie já revalidado no layout — senão Agenda/Sedes/
  // Loja voltavam à CN a cada clique da topbar.
  const naComunidade = pathname.startsWith('/portal/comunidade')
  const escopoParam = searchParams.get('escopo')
  const escopoDaUrl: EscopoComunidade | null =
    escopoParam === 'nacional' || escopoParam === 'torcida' || escopoParam === 'unidade'
      ? escopoParam
      : null
  const escopoEfetivo: EscopoComunidade | null =
    (naComunidade ? (escopoAtivo ?? escopoDaUrl ?? escopoCanal) : escopoCanal) ??
    (modoNacional ? 'nacional' : null)
  const emEscopoNacional = escopoEfetivo === 'nacional'
  // Cadeado segue só o escopo da Comunidade: fora dela (perfil, mensagens) o
  // canal lido não pode esconder a porta do /admin de quem tem acesso.
  const mostrarCadeadoAdmin =
    hasAdminAreaAccess && !(naComunidade && emEscopoNacional)

  const ocultosNacional = temVinculoTorcida
    ? LINKS_OCULTOS_TORCEDOR_VINCULO
    : LINKS_SOMENTE_TORCIDA
  const baseLinks = modoNacional
    ? navLinks.filter((link) => !ocultosNacional.has(link.href))
    : [...navLinks]
  // Departamentos: só sócio com área (temDepartamentos) ou SA no tenant.
  // Torcedor do convite nunca entra — layout já passa 0 no modo nacional.
  // CN / temático: o filtro abaixo remove o atalho mesmo com temDepartamentos.
  const linksComDepto = temDepartamentos
    ? [baseLinks[0]!, departamentosLink, ...baseLinks.slice(1)]
    : [...baseLinks]
  const ocultarModulos = emEscopoNacional || ocultarModulosReativos
  const links = ocultarModulos
    ? linksComDepto.filter((link) => !LINKS_REATIVOS_CANAL.has(link.href))
    : linksComDepto

  type NavItem = {
    href: string
    label: string
    icon: typeof Users
    prefetch: 'hover'
  }

  const ctasAposComunidade: NavItem[] = []
  if (associeSe) {
    ctasAposComunidade.push({
      href: associeSe.href,
      label: associeSe.label,
      icon: UserPlus,
      prefetch: 'hover',
    })
  }
  if (emEscopoNacional) {
    ctasAposComunidade.push({
      href: '/portal/mapa-brasil',
      label: 'Ver no Brasil',
      icon: Globe2,
      prefetch: 'hover',
    })
  }

  const linksNav: NavItem[] = (() => {
    const extra = ctasAposComunidade
    const idx = links.findIndex((l) => l.href === '/portal/comunidade')
    const comoItens: NavItem[] = links.map((l) => ({
      href: l.href,
      label: l.label,
      icon: l.icon,
      prefetch: l.prefetch,
    }))
    if (idx === -1) return [...extra, ...comoItens]
    return [...comoItens.slice(0, idx + 1), ...extra, ...comoItens.slice(idx + 1)]
  })()

  // Abaixo de xl a faixa de ações fica só com Mensagens e notificações: os
  // módulos (Agenda/Sedes/Loja/…) já aparecem inteiros no menu hambúrguer, e
  // repetir cada um como ícone poluía a topbar no celular. Admin e tema
  // entram no dropdown do usuário (desktop) ou no hambúrguer (abaixo de xl).

  // Volta para a Comunidade na aba que a pessoa estava lendo. Sem o param, o
  // resolver cai no default do modo (CN para torcedor) e a ida a Agenda/Loja
  // viraria uma troca silenciosa de canal.
  const hrefComunidade = escopoEfetivo
    ? `/portal/comunidade?escopo=${escopoEfetivo}`
    : '/portal/comunidade'

  function hrefDoLink(href: string) {
    if (href === '/portal/comunidade') return hrefComunidade
    // Memória segue o canal da top bar (cookie), não o tenant da sessão.
    if (href === '/portal/memoria') {
      if (emEscopoNacional) return '/portal/memoria?escopo=clube'
      if (escopoEfetivo === 'torcida') return '/portal/memoria?escopo=torcida'
      if (escopoEfetivo === 'unidade') return '/portal/memoria?escopo=unidade'
    }
    return href
  }

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

  const dropItemClass =
    'app-action flex w-full items-center gap-2 px-4 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]'

  return (
    <NavPendingProvider>
      <header className="relative sticky top-0 z-40 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] backdrop-blur-sm">
        <div className="app-container flex h-14 items-center gap-2 sm:gap-4">

          <PortalNavLink href={hrefComunidade} className="app-touch-line flex min-w-0 shrink items-center gap-2" showSpinner={false}>
            {brandTenant.logoUrl ? (
              <LogoMiniatura
                src={brandTenant.logoUrl}
                alt={brandTenant.nome}
                className="rounded-lg"
                rounded="rounded-lg"
              />
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

          <ScrollRail
            as="nav"
            wrapperClassName="flex-1 xl:hidden"
            className="flex items-center gap-0.5"
          >
            {linksNav
              .filter(
                (link) =>
                  link.href === '/portal/comunidade' ||
                  link.href === '/portal/mapa-brasil' ||
                  link.href === '/portal/associe-se' ||
                  link.href.startsWith('/onboarding/solicitado'),
              )
              .map((link) => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                  <PortalNavLink
                    key={`sm-${link.href}`}
                    href={hrefDoLink(link.href)}
                    prefetch={link.prefetch}
                    className={`${linkClass(active)} shrink-0`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {link.label}
                  </PortalNavLink>
                )
              })}
          </ScrollRail>

          <ScrollRail
            as="nav"
            wrapperClassName="hidden flex-1 xl:block"
            className="flex items-center gap-0.5"
          >
            {linksNav.map((link) => {
              const Icon = link.icon
              const active = isActive(link.href)
              return (
                <PortalNavLink
                  key={link.href}
                  href={hrefDoLink(link.href)}
                  prefetch={link.prefetch}
                  className={`${linkClass(active)} shrink-0`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {link.label}
                  <PendenciaBadge count={badgeDaNav(link.href, navBadges)} />
                </PortalNavLink>
              )
            })}
          </ScrollRail>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <PortalNavLink
              href="/portal/mensagens"
              prefetch="hover"
              aria-label={
                unreadMessages > 0
                  ? `Mensagens (${unreadMessages} não lidas)`
                  : 'Mensagens'
              }
              className={[
                'app-action relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
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

            <div ref={userDropRef} className="relative hidden xl:block">
              <button
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
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
                  <Link
                    href="/portal/perfil"
                    onClick={() => setUserDropOpen(false)}
                    className={dropItemClass}
                  >
                    <UserCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                    Meu Perfil
                  </Link>
                  {mostrarCadeadoAdmin && (
                    <Link
                      href="/admin"
                      prefetch={false}
                      onClick={() => setUserDropOpen(false)}
                      className={dropItemClass}
                    >
                      <Lock className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                      Área administrativa
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link
                      href="/super-admin"
                      prefetch={false}
                      onClick={() => setUserDropOpen(false)}
                      className={dropItemClass}
                    >
                      <Shield className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                      Área Super Admin
                    </Link>
                  )}
                  <ThemeToggle variant="dropdown" />
                  <div className="my-1 border-t border-[rgb(var(--border))]" />
                  <button
                    onClick={() => signOut({ callbackUrl: '/entrar' })}
                    className="app-action flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sair
                  </button>
                </div>
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
              {linksNav.map((link) => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                  <PortalNavLink
                    key={link.href}
                    href={hrefDoLink(link.href)}
                    prefetch={link.prefetch}
                    onClick={() => setMenuOpen(false)}
                    className={mobileLinkClass(active)}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                    <PendenciaBadge
                      count={badgeDaNav(link.href, navBadges)}
                      className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                    />
                  </PortalNavLink>
                )
              })}
              {mostrarCadeadoAdmin && (
                <Link
                  href="/admin"
                  prefetch={false}
                  onClick={() => setMenuOpen(false)}
                  className={mobileLinkClass(pathname.startsWith('/admin'))}
                >
                  <Lock className="h-4 w-4" />
                  Área administrativa
                </Link>
              )}
              {isSuperAdmin && (
                <Link
                  href="/super-admin"
                  prefetch={false}
                  onClick={() => setMenuOpen(false)}
                  className={mobileLinkClass(pathname.startsWith('/super-admin'))}
                >
                  <Shield className="h-4 w-4" />
                  Área Super Admin
                </Link>
              )}
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
