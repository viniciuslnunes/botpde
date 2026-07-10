'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Users, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostGrupo } from '@/app/portal/comunidade/actions'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import type { GrupoDetalheItem, PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface GrupoDetalheClientProps {
  grupo: GrupoDetalheItem
  posts: PostSocialItem[]
  salvoIds: string[]
  currentUser: CurrentUser
}

export function GrupoDetalheClient({
  grupo,
  posts: postsIniciais,
  salvoIds,
  currentUser,
}: GrupoDetalheClientProps) {
  const [aba, setAba] = useState<'mural' | 'chat'>('mural')
  const [conteudo, setConteudo] = useState('')
  const [pending, startTransition] = useTransition()

  function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) return
    startTransition(async () => {
      const result = await publicarPostGrupo(grupo.id, conteudo.trim())
      if (!result.success) {
        toast.error(result.message ?? 'Não foi possível publicar.')
        return
      }
      setConteudo('')
      toast.success('Publicado no mural!')
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{grupo.nome ?? 'Grupo'}</h1>
        {grupo.descricao && (
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{grupo.descricao}</p>
        )}
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
          <Users className="h-3.5 w-3.5" />
          {grupo.membros} membro{grupo.membros === 1 ? '' : 's'}
        </span>
      </header>

      <div className="flex gap-2 border-b border-[rgb(var(--border))]">
        <button
          type="button"
          onClick={() => setAba('mural')}
          className={[
            'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            aba === 'mural'
              ? 'border-[rgb(var(--primary))] text-[rgb(var(--primary))]'
              : 'border-transparent text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          Mural
        </button>
        <Link
          href={`/portal/mensagens?c=${grupo.id}`}
          className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </Link>
      </div>

      {aba === 'mural' && (
        <div className="space-y-4">
          <form
            onSubmit={publicar}
            className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              maxLength={3000}
              rows={3}
              placeholder="Publique no mural do grupo…"
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

          {postsIniciais.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma publicação no mural ainda. Seja o primeiro!
            </div>
          ) : (
            postsIniciais.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                salvo={salvoIds.includes(post.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
