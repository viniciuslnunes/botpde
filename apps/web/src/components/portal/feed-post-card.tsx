import Link from 'next/link'
import { formatRelative } from '@/lib/format-datetime'
import { Avatar } from './avatar'
import { PostEngagement } from './post-engagement'
import type { PostSocialItem } from '@/lib/feed'

interface FeedPostCardProps {
  post: PostSocialItem
  showTenantBadge?: boolean
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
}

export function FeedPostCard({ post, showTenantBadge = false, currentUser }: FeedPostCardProps) {
  return (
    <article className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <header className="flex items-center gap-3">
        <Link href={`/portal/comunidade/perfil/${post.autor.id}`}>
          <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link
              href={`/portal/comunidade/perfil/${post.autor.id}`}
              className="text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
            >
              {post.autor.nome ?? 'Membro'}
            </Link>
            {showTenantBadge && (
              <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                {post.tenant.nome}
              </span>
            )}
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">{formatRelative(post.criadoEm)}</p>
        </div>
      </header>

      {post.titulo && (
        <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
      )}

      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]">
        {post.conteudo}
      </p>

      {post.imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imagemUrl}
          alt=""
          className="mt-3 max-h-[28rem] w-full rounded-xl border border-[rgb(var(--border))] object-cover"
        />
      )}

      <PostEngagement
        postId={post.id}
        totalReacoes={post.totalReacoes}
        totalComentarios={post.totalComentarios}
        minhaReacao={post.minhaReacao}
        currentUser={currentUser}
      />
    </article>
  )
}
