'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Search, Loader2, Hash, FileText, Radio, Building2 } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { PostConteudoRich } from '@/components/portal/post-conteudo-rich'
import { linkPostComunidade } from '@/lib/comunidade-social'
import type { MembroBuscaItem } from '@/lib/comunidade-busca'
import type { CanalItem, UnidadeBuscaItem } from '@/lib/canais-shared'
import { labelTipoUnidade, linkCanalComunidade, linkUnidadeComunidade } from '@/lib/canais-shared'
import type { PostSocialItem } from '@/lib/feed'
import { fadeUp, menuItemStagger, springSnappy } from '@/lib/motion-presets'

interface BuscaResponse {
  membros: MembroBuscaItem[]
  hashtags: Array<{ tag: string; total: number }>
  posts: PostSocialItem[]
  canais: CanalItem[]
  unidades: UnidadeBuscaItem[]
}

export function BuscaMembrosClient() {
  const searchParams = useSearchParams()
  const inicial = searchParams.get('q') ?? ''
  const [q, setQ] = useState(inicial)
  const [debounced, setDebounced] = useState(inicial.trim())
  const [resultado, setResultado] = useState<BuscaResponse>({
    membros: [],
    hashtags: [],
    posts: [],
    canais: [],
    unidades: [],
  })
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 2) {
      setResultado({ membros: [], hashtags: [], posts: [], canais: [], unidades: [] })
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/comunidade/busca?q=${encodeURIComponent(termo)}`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Erro na busca')
      }
      const data = (await res.json()) as BuscaResponse
      setResultado(data)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na busca')
      setResultado({ membros: [], hashtags: [], posts: [], canais: [], unidades: [] })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    startTransition(() => void buscar(debounced))
  }, [debounced, buscar])

  const vazio =
    !carregando &&
    debounced.length >= 2 &&
    !erro &&
    resultado.membros.length === 0 &&
    resultado.hashtags.length === 0 &&
    resultado.posts.length === 0 &&
    resultado.canais.length === 0 &&
    resultado.unidades.length === 0

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar membros, canais, unidades, hashtags ou posts…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          autoFocus={!inicial}
        />
      </div>

      <AnimatePresence mode="wait">
        {carregando && (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando…
          </m.div>
        )}

        {!carregando && erro && (
          <m.p
            key="erro"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {erro}
          </m.p>
        )}

        {!carregando && vazio && (
          <m.p
            key="vazio"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
          >
            Nenhum resultado para &quot;{debounced}&quot;.
          </m.p>
        )}

        {!carregando && debounced.length < 2 && (
          <m.p
            key="hint"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="py-8 text-center text-sm text-[rgb(var(--foreground-muted))]"
          >
            Digite ao menos 2 caracteres para buscar.
          </m.p>
        )}
      </AnimatePresence>

      {!carregando && !erro && debounced.length >= 2 && !vazio && (
        <m.div
          key={debounced}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-6"
        >
      {resultado.unidades.length > 0 && (
        <m.section custom={0} variants={menuItemStagger} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Building2 className="h-4 w-4" />
            Unidades
          </h2>
          <div className="space-y-2">
            {resultado.unidades.map((u) => (
              <Link
                key={u.tenantId}
                href={linkUnidadeComunidade(u.tenantId)}
                className="block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <p className="font-semibold text-[rgb(var(--foreground))]">{u.nome}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {labelTipoUnidade(u.tipo)}
                  {u.cidade ? ` · ${u.cidade}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </m.section>
      )}

      {resultado.canais.length > 0 && (
        <m.section custom={1} variants={menuItemStagger} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Radio className="h-4 w-4" />
            Canais
          </h2>
          <div className="space-y-2">
            {resultado.canais.map((c) => (
              <Link
                key={c.id}
                href={c.canalOficial ? linkUnidadeComunidade(c.tenantId) : linkCanalComunidade(c.id)}
                className="block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <p className="font-semibold text-[rgb(var(--foreground))]">{c.nome ?? 'Canal'}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {c.tenantNome}
                  {c.canalOficial ? ' · Oficial' : ' · Temático'}
                </p>
              </Link>
            ))}
          </div>
        </m.section>
      )}

      {resultado.hashtags.length > 0 && (
        <m.section custom={2} variants={menuItemStagger} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <Hash className="h-4 w-4" />
            Hashtags
          </h2>
          <div className="flex flex-wrap gap-2">
            {resultado.hashtags.map((h) => (
              <Link
                key={h.tag}
                href={`/portal/comunidade/hashtag/${encodeURIComponent(h.tag)}`}
                className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
              >
                #{h.tag}
                <span className="ml-1.5 text-xs text-[rgb(var(--foreground-muted))]">{h.total}</span>
              </Link>
            ))}
          </div>
        </m.section>
      )}

      {resultado.membros.length > 0 && (
        <m.section custom={3} variants={menuItemStagger} className="space-y-2">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Membros</h2>
          <div className="space-y-2">
            {resultado.membros.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
              >
                <Link href={`/portal/comunidade/perfil/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar nome={m.nome} avatarUrl={m.avatarUrl} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                      {m.nome ?? 'Membro'}
                    </p>
                    <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                      {m.tenantNome}
                      {m.seguidores > 0 && ` · ${m.seguidores} seguidor${m.seguidores === 1 ? '' : 'es'}`}
                      {m.perfilPrivado && ' · Privado'}
                    </p>
                  </div>
                </Link>
                {m.podeSeguir && <SeguimentoButtons userId={m.id} status={m.statusSeguimento} />}
              </div>
            ))}
          </div>
        </m.section>
      )}

      {resultado.posts.length > 0 && (
        <m.section custom={4} variants={menuItemStagger} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <FileText className="h-4 w-4" />
            Posts
          </h2>
          <div className="space-y-2">
            {resultado.posts.map((p) => (
              <Link
                key={p.id}
                href={linkPostComunidade(p.id)}
                className="block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  {p.autor.nome ?? 'Membro'} · {p.tenant.nome}
                </p>
                <PostConteudoRich
                  conteudo={p.conteudo}
                  className="mt-1 line-clamp-2 text-sm text-[rgb(var(--foreground))]"
                />
              </Link>
            ))}
          </div>
        </m.section>
      )}
        </m.div>
      )}
    </div>
  )
}
