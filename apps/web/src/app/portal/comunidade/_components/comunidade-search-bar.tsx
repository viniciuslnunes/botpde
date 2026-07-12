'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Search, Loader2, Hash, X, ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { linkPostComunidade } from '@/lib/comunidade-social'
import type { MembroBuscaItem } from '@/lib/comunidade-busca'
import type { PostSocialItem } from '@/lib/feed'
import { menuItemStagger, popoverPanel, springGentle, springSnappy } from '@/lib/motion-presets'

interface BuscaRapidaResponse {
  membros: MembroBuscaItem[]
  hashtags: Array<{ tag: string; total: number }>
  posts: PostSocialItem[]
}

export function ComunidadeSearchBar() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [aberto, setAberto] = useState(false)
  const [resultado, setResultado] = useState<BuscaRapidaResponse>({
    membros: [],
    hashtags: [],
    posts: [],
  })
  const [carregando, setCarregando] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 2) {
      setResultado({ membros: [], hashtags: [], posts: [] })
      return
    }
    setCarregando(true)
    try {
      const res = await fetch(`/api/comunidade/busca?q=${encodeURIComponent(termo)}`)
      if (!res.ok) return
      const data = (await res.json()) as BuscaRapidaResponse
      setResultado({
        membros: data.membros.slice(0, 4),
        hashtags: data.hashtags.slice(0, 4),
        posts: data.posts.slice(0, 3),
      })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!aberto) return
    startTransition(() => void buscar(debounced))
  }, [debounced, buscar, aberto])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const temResultados =
    resultado.membros.length > 0 || resultado.hashtags.length > 0 || resultado.posts.length > 0

  function irParaBuscaCompleta() {
    const termo = q.trim()
    if (termo.length < 2) return
    setAberto(false)
    router.push(`/portal/comunidade/busca?q=${encodeURIComponent(termo)}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <m.div
        animate={
          aberto
            ? { boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.12)' }
            : { boxShadow: '0 0 0 0px rgba(124, 58, 237, 0)' }
        }
        transition={springSnappy}
        className={['relative rounded-xl', aberto ? 'z-30' : 'z-0'].join(' ')}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              irParaBuscaCompleta()
            }
            if (e.key === 'Escape') {
              setAberto(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Buscar membros, hashtags, posts…"
          aria-label="Buscar na comunidade"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls="comunidade-busca-rapida"
          className={[
            'h-11 w-full rounded-xl border bg-[rgb(var(--surface))] pl-10 pr-10 text-sm text-[rgb(var(--foreground))] outline-none transition-colors duration-200',
            aberto
              ? 'border-[rgb(var(--primary))]'
              : 'border-[rgb(var(--border))] hover:border-[rgb(var(--border-strong))]',
          ].join(' ')}
        />
        <AnimatePresence>
          {q.length > 0 && (
            <m.button
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springSnappy}
              onClick={() => {
                setQ('')
                setDebounced('')
                setResultado({ membros: [], hashtags: [], posts: [] })
                inputRef.current?.focus()
              }}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
            >
              <X className="h-3.5 w-3.5" />
            </m.button>
          )}
        </AnimatePresence>
      </m.div>

      <AnimatePresence>
        {aberto && (
          <m.div
            id="comunidade-busca-rapida"
            key="busca-panel"
            variants={popoverPanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="card-soft absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
          >
            <AnimatePresence mode="wait">
              {carregando ? (
                <m.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-[rgb(var(--foreground-muted))]"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </m.div>
              ) : debounced.length < 2 ? (
                <m.p
                  key="hint"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-5 text-center text-sm text-[rgb(var(--foreground-muted))]"
                >
                  Digite ao menos 2 caracteres para buscar.
                </m.p>
              ) : !temResultados ? (
                <m.p
                  key="empty"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-5 text-center text-sm text-[rgb(var(--foreground-muted))]"
                >
                  Nenhum resultado para &quot;{debounced}&quot;.
                </m.p>
              ) : (
                <m.div
                  key="results"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                  className="max-h-[min(60vh,22rem)] overflow-y-auto py-1"
                >
                  {resultado.membros.length > 0 && (
                    <section className="px-2 py-1">
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Membros
                      </p>
                      {resultado.membros.map((membro, i) => (
                        <m.div key={membro.id} custom={i} variants={menuItemStagger}>
                          <Link
                            href={`/portal/comunidade/perfil/${membro.id}`}
                            onClick={() => setAberto(false)}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                          >
                            <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                                {membro.nome ?? 'Membro'}
                              </p>
                              <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{membro.tenantNome}</p>
                            </div>
                          </Link>
                        </m.div>
                      ))}
                    </section>
                  )}

                  {resultado.hashtags.length > 0 && (
                    <section className="px-2 py-1">
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Hashtags
                      </p>
                      <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                        {resultado.hashtags.map((h, i) => (
                          <m.div
                            key={h.tag}
                            custom={resultado.membros.length + i}
                            variants={menuItemStagger}
                          >
                            <Link
                              href={`/portal/comunidade/hashtag/${encodeURIComponent(h.tag)}`}
                              onClick={() => setAberto(false)}
                              className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--primary))] transition-colors hover:bg-[rgb(var(--surface))]"
                            >
                              <Hash className="h-3 w-3" />
                              {h.tag}
                            </Link>
                          </m.div>
                        ))}
                      </div>
                    </section>
                  )}

                  {resultado.posts.length > 0 && (
                    <section className="px-2 py-1">
                      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Posts
                      </p>
                      {resultado.posts.map((p, i) => (
                        <m.div
                          key={p.id}
                          custom={resultado.membros.length + resultado.hashtags.length + i}
                          variants={menuItemStagger}
                        >
                          <Link
                            href={linkPostComunidade(p.id)}
                            onClick={() => setAberto(false)}
                            className="block rounded-lg px-2 py-2 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                          >
                            <p className="text-xs text-[rgb(var(--foreground-muted))]">{p.autor.nome ?? 'Membro'}</p>
                            <p className="line-clamp-1 text-sm text-[rgb(var(--foreground))]">{p.conteudo}</p>
                          </Link>
                        </m.div>
                      ))}
                    </section>
                  )}
                </m.div>
              )}
            </AnimatePresence>

            {debounced.length >= 2 && (
              <div className="border-t border-[rgb(var(--border))] p-2">
                <m.button
                  type="button"
                  onClick={irParaBuscaCompleta}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springSnappy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[rgb(var(--primary))] transition-colors hover:bg-[rgb(var(--primary)_/_0.08)]"
                >
                  Ver todos os resultados
                  <ArrowRight className="h-4 w-4" />
                </m.button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
