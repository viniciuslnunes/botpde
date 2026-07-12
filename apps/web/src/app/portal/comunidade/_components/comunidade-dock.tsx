'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Home, Search, Video, Plus } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { springSnappy } from '@/lib/motion-presets'

interface ComunidadeDockProps {
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
}

/**
 * Dock flutuante do mobile no padrão social. Renderizado via portal em
 * document.body para que position:fixed fique ancorado na viewport (evita
 * deslocamento quando há transform/filter em ancestrais do layout).
 */
export function ComunidadeDock({ currentUser }: ComunidadeDockProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

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

  const dock = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
      style={{ left: 0, right: 0 }}
    >
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="pointer-events-auto"
      >
        <nav
          aria-label="Navegação da comunidade"
          className="dock-shadow flex items-center gap-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-2 py-1.5 backdrop-blur-md"
        >
          {items.map((item) => {
            const Icon = item.icon
            return (
              <m.div key={item.href} whileTap={{ scale: 0.9 }} transition={springSnappy}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  className={itemClass(item.active)}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={item.active ? 2.4 : 2} />
                  <AnimatePresence>
                    {item.active && (
                      <m.span
                        layoutId="dock-active-dot"
                        className="h-1 w-1 rounded-full bg-[rgb(var(--primary))]"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={springSnappy}
                      />
                    )}
                  </AnimatePresence>
                </Link>
              </m.div>
            )
          })}

          <m.button
            type="button"
            onClick={abrirComposer}
            aria-label="Criar publicação"
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.04 }}
            transition={springSnappy}
            className="mx-1 flex items-center justify-center rounded-full bg-[rgb(var(--primary))] text-white shadow-lg shadow-[rgb(var(--primary)_/_0.4)]"
            style={{ height: '3.25rem', width: '3.25rem' }}
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </m.button>

          {itemsRight.map((item) => {
            const Icon = item.icon
            return (
              <m.div key={item.href} whileTap={{ scale: 0.9 }} transition={springSnappy}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  className={itemClass(item.active)}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={item.active ? 2.4 : 2} />
                  <AnimatePresence>
                    {item.active && (
                      <m.span
                        className="h-1 w-1 rounded-full bg-[rgb(var(--primary))]"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={springSnappy}
                      />
                    )}
                  </AnimatePresence>
                </Link>
              </m.div>
            )
          })}

          <m.div whileTap={{ scale: 0.92 }} transition={springSnappy}>
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
          </m.div>
        </nav>
      </m.div>
    </div>
  )

  if (!mounted) return null
  return createPortal(dock, document.body)
}
