'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Video, Plus } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'

interface ComunidadeDockProps {
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
}

/**
 * Dock flutuante do mobile no padrão social: pílula fixa no rodapé com os
 * destinos principais e um FAB central que abre o composer. Só aparece em
 * telas pequenas (o desktop usa a sidebar de navegação).
 *
 * O FAB emite `comunidade:compose` quando já estamos no feed (o composer
 * escuta e expande); em qualquer outra rota, navega ao feed pedindo abertura.
 */
export function ComunidadeDock({ currentUser }: ComunidadeDockProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isFeed = pathname === '/portal/comunidade'

  const items = [
    { href: '/portal/comunidade', label: 'Feed', icon: Home, active: isFeed },
    {
      href: '/portal/comunidade/busca',
      label: 'Buscar',
      icon: Search,
      active: pathname.startsWith('/portal/comunidade/busca'),
    },
  ]

  const itemsRight = [
    {
      href: '/portal/comunidade/videos',
      label: 'Vídeos',
      icon: Video,
      active: pathname.startsWith('/portal/comunidade/videos'),
    },
  ]

  const perfilAtivo = pathname.startsWith('/portal/comunidade/perfil')

  function abrirComposer() {
    if (isFeed) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.dispatchEvent(new CustomEvent('comunidade:compose'))
    } else {
      router.push('/portal/comunidade?compose=1')
    }
  }

  function itemClass(active: boolean) {
    return [
      'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full transition-colors',
      active
        ? 'text-[rgb(var(--primary))]'
        : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
    ].join(' ')
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      <nav
        aria-label="Navegação da comunidade"
        className="dock-shadow dock-rise pointer-events-auto flex items-center gap-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-2 py-1.5 backdrop-blur-md"
      >
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className={itemClass(item.active)}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={item.active ? 2.4 : 2} />
              {item.active && <span className="h-1 w-1 rounded-full bg-[rgb(var(--primary))]" />}
            </Link>
          )
        })}

        <button
          type="button"
          onClick={abrirComposer}
          aria-label="Criar publicação"
          className="mx-1 flex items-center justify-center rounded-full bg-[rgb(var(--primary))] text-white shadow-lg shadow-[rgb(var(--primary)_/_0.4)] transition-transform active:scale-95"
          style={{ height: '3.25rem', width: '3.25rem' }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>

        {itemsRight.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className={itemClass(item.active)}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={item.active ? 2.4 : 2} />
              {item.active && <span className="h-1 w-1 rounded-full bg-[rgb(var(--primary))]" />}
            </Link>
          )
        })}

        <Link
          href={currentUser.id ? `/portal/comunidade/perfil/${currentUser.id}` : '/portal/comunidade'}
          aria-label="Meu perfil"
          aria-current={perfilAtivo ? 'page' : undefined}
          className="flex h-12 w-12 items-center justify-center"
        >
          <span
            className={[
              'rounded-full transition-all',
              perfilAtivo ? 'ring-2 ring-[rgb(var(--primary))] ring-offset-2 ring-offset-[rgb(var(--surface))]' : '',
            ].join(' ')}
          >
            <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="sm" />
          </span>
        </Link>
      </nav>
    </div>
  )
}
