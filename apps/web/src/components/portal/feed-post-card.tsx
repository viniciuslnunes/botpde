import Link from 'next/link'
import { Repeat2 } from 'lucide-react'
import { formatRelative } from '@/lib/format-datetime'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { Avatar } from './avatar'
import { PostEngagement } from './post-engagement'
import { PostMedia } from './post-media'
import { PostLegacyImage } from './post-legacy-image'
import { FeedPostMenu } from './feed-post-menu'
import { PostConteudoRich } from './post-conteudo-rich'
import { PostPoll } from './post-poll'
import { PostRepostEmbed } from './post-repost-embed'
import type { PostSocialItem } from '@/lib/feed'

interface FeedPostCardProps {
  post: PostSocialItem
  showTenantBadge?: boolean
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  isAuthor?: boolean
}

export function FeedPostCard({ post, showTenantBadge = false, currentUser, isAuthor }: FeedPostCardProps) {
  const author = post.autorId === currentUser.id
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
          <Link
            href={linkPostComunidade(post.id)}
            className="text-xs text-[rgb(var(--foreground-muted))] hover:underline"
          >
            {formatRelative(post.criadoEm)}
          </Link>
        </div>
        {(isAuthor || author) && <FeedPostMenu postId={post.id} conteudoInicial={post.conteudo} />}
      </header>

      {post.titulo && (
        <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
      )}

      {post.postOrigemId && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <Repeat2 className="h-3.5 w-3.5" />
          Compartilhou uma publicação
        </p>
      )}

      <PostConteudoRich conteudo={post.conteudo} className="mt-2" />

      {post.postOrigem && <PostRepostEmbed origem={post.postOrigem} />}

      {post.enquete && <PostPoll enquete={post.enquete} />}

      {post.midiaUrls.length > 0 ? (
        <PostMedia urls={post.midiaUrls} />
      ) : (
        post.imagemUrl && <PostLegacyImage src={post.imagemUrl} />
      )}

      <PostEngagement
        postId={post.id}
        totalReacoes={post.totalReacoes}
        totalComentarios={post.totalComentarios}
        minhaReacao={post.minhaReacao}
        currentUser={currentUser}
        isRepost={!!post.postOrigemId}
      />
    </article>
  )
}
