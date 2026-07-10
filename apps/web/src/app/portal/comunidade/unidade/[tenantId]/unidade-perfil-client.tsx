'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, MapPin, Loader2, Megaphone, CalendarDays } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostCanal } from '@/app/portal/comunidade/actions'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { PostConteudoRich } from '@/components/portal/post-conteudo-rich'
import { formatRelative } from '@/lib/format-datetime'
import {
  labelTipoUnidade,
  linkCanalComunidade,
  type PerfilInstitucional,
} from '@/lib/canais'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface UnidadePerfilClientProps {
  perfil: PerfilInstitucional
  salvoIds: string[]
  currentUser: CurrentUser
  isPropriaUnidade: boolean
}

export function UnidadePerfilClient({
  perfil,
  salvoIds,
  currentUser,
  isPropriaUnidade,
}: UnidadePerfilClientProps) {
  const [aba, setAba] = useState<'mural' | 'comunicados' | 'eventos'>('mural')
  const [conteudo, setConteudo] = useState('')
  const [pending, startTransition] = useTransition()

  const muralPosts: PostSocialItem[] = [...perfil.postsCanal, ...perfil.postsInstitucionais].sort(
    (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
  )

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    startTransition(async () => {
      const result = await publicarPostCanal(perfil.canalOficialId, conteudo.trim())
      if (!result.success) {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setConteudo('')
      toast.success('Publicado no canal oficial!')
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <header
        className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        style={{ borderTopColor: perfil.corPrimaria, borderTopWidth: 3 }}
      >
        <div className="flex items-start gap-4 p-4">
          {perfil.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={perfil.logoUrl}
              alt=""
              className="h-16 w-16 rounded-xl border border-[rgb(var(--border))] object-cover"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl text-xl font-bold text-white"
              style={{ backgroundColor: perfil.corPrimaria }}
            >
              {perfil.nome.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
              {labelTipoUnidade(perfil.tipo)}
              {isPropriaUnidade && ' · Sua unidade'}
            </p>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{perfil.nome}</h1>
            {perfil.cidade && (
              <p className="mt-1 flex items-center gap-1 text-sm text-[rgb(var(--foreground-muted))]">
                <MapPin className="h-3.5 w-3.5" />
                {perfil.cidade}
              </p>
            )}
            <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
              Canal oficial — publicações apenas de administradores autorizados
            </p>
          </div>
          <Link
            href={`/portal/mensagens?c=${perfil.canalOficialId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
          >
            <MessageCircle className="h-4 w-4" />
            Chat
          </Link>
        </div>
      </header>

      <div className="flex gap-2 border-b border-[rgb(var(--border))]">
        {(['mural', 'comunicados', 'eventos'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setAba(tab)}
            className={[
              'border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
              aba === tab
                ? 'border-[rgb(var(--primary))] text-[rgb(var(--primary))]'
                : 'border-transparent text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {tab === 'mural' ? 'Mural' : tab === 'comunicados' ? 'Comunicados' : 'Eventos'}
          </button>
        ))}
      </div>

      {aba === 'mural' && (
        <div className="space-y-4">
          {perfil.podePublicar && (
            <form
              onSubmit={publicar}
              className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                maxLength={3000}
                rows={3}
                placeholder="Publicar no canal oficial da unidade…"
                className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !conteudo.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Publicar como unidade
              </button>
            </form>
          )}

          {muralPosts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma publicação no mural oficial ainda.
            </div>
          ) : (
            muralPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                salvo={salvoIds.includes(post.id)}
                showTenantBadge
              />
            ))
          )}
        </div>
      )}

      {aba === 'comunicados' && (
        <div className="space-y-3">
          {perfil.comunicados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum comunicado oficial publicado.
            </div>
          ) : (
            perfil.comunicados.map((c) => (
              <article
                key={c.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <div className="flex items-start gap-2">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--primary))]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[rgb(var(--foreground))]">{c.titulo}</h3>
                      {c.fixado && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          Fixado
                        </span>
                      )}
                      {c.prioridade !== 'NORMAL' && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          {c.prioridade}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                      {formatRelative(c.publicadoEm)}
                    </p>
                    <PostConteudoRich
                      conteudo={c.corpo}
                      className="mt-2 text-sm text-[rgb(var(--foreground))]"
                    />
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {aba === 'eventos' && (
        <div className="space-y-3">
          {perfil.proximosEventos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum evento futuro agendado.
            </div>
          ) : (
            perfil.proximosEventos.map((ev) => (
              <Link
                key={ev.id}
                href={`/portal/eventos/${ev.id}`}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--primary))]" />
                <div>
                  <p className="font-semibold text-[rgb(var(--foreground))]">{ev.titulo}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {formatRelative(ev.data)}
                    {ev.local ? ` · ${ev.local}` : ''}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        <Link href={linkCanalComunidade(perfil.canalOficialId)} className="text-[rgb(var(--primary))] hover:underline">
          Ver canal completo →
        </Link>
      </p>
    </div>
  )
}
