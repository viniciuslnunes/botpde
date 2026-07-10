'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Users, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostCanal, entrarCanal } from '@/app/portal/comunidade/actions'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { labelVisibilidadeCanal, linkUnidadeComunidade, type CanalItem } from '@/lib/canais'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface CanalDetalheClientProps {
  canal: CanalItem
  posts: PostSocialItem[]
  salvoIds: string[]
  currentUser: CurrentUser
  podePublicar: boolean
}

export function CanalDetalheClient({
  canal,
  posts,
  salvoIds,
  currentUser,
  podePublicar,
}: CanalDetalheClientProps) {
  const [conteudo, setConteudo] = useState('')
  const [pending, startTransition] = useTransition()

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    startTransition(async () => {
      const result = await publicarPostCanal(canal.id, conteudo.trim())
      if (!result.success) {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setConteudo('')
      toast.success('Publicado!')
      window.location.reload()
    })
  }

  function inscrever() {
    startTransition(async () => {
      try {
        await entrarCanal(canal.id)
        toast.success('Inscrito no canal!')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao inscrever.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
              {canal.canalOficial ? 'Canal oficial' : 'Comunidade temática'}
            </p>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{canal.nome ?? 'Canal'}</h1>
            {canal.descricao && (
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{canal.descricao}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {canal.membros} inscrito{canal.membros === 1 ? '' : 's'}
              </span>
              <span>{canal.tenantNome}</span>
              <span>{labelVisibilidadeCanal(canal.visibilidadeCanal)}</span>
              {canal.somenteAdminPublica && <span>Só admins publicam</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {canal.canalOficial && (
              <Link
                href={linkUnidadeComunidade(canal.tenantId)}
                className="text-center text-xs font-medium text-[rgb(var(--primary))] hover:underline"
              >
                Perfil da unidade
              </Link>
            )}
            {canal.souMembro ? (
              <Link
                href={`/portal/mensagens?c=${canal.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={inscrever}
                className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Inscrever
              </button>
            )}
          </div>
        </div>
      </header>

      {canal.souMembro && podePublicar && (
        <form
          onSubmit={publicar}
          className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            maxLength={3000}
            rows={3}
            placeholder="Publicar no canal…"
            className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending || !conteudo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publicar
          </button>
        </form>
      )}

      {!canal.souMembro && (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Inscreva-se no canal para ver o mural completo e participar do chat.
        </div>
      )}

      {canal.souMembro && (
        <>
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma publicação no canal ainda.
            </div>
          ) : (
            posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                salvo={salvoIds.includes(post.id)}
                showTenantBadge
              />
            ))
          )}
        </>
      )}
    </div>
  )
}
