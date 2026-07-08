import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { PostEngagement } from './post-engagement'

interface FeedPostCardProps {
  post: {
    id: string
    tenantId: string
    titulo: string | null
    conteudo: string
    imagemUrl: string | null
    criadoEm: Date
    tenant: { nome: string }
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }
  showTenantBadge?: boolean
}

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export function FeedPostCard({ post, showTenantBadge = false }: FeedPostCardProps) {
  return (
    <article className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/portal/comunidade/perfil/${post.autor.id}`}
              className="text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
            >
              {post.autor.nome ?? 'Membro'}
            </Link>
            {showTenantBadge && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {post.tenant.nome}
              </span>
            )}
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">{formatarData(post.criadoEm)}</p>
        </div>
        <MessageSquare className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
      </header>

      {post.titulo && <h3 className="mt-2 text-sm font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>}

      <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{post.conteudo}</p>

      {post.imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imagemUrl}
          alt=""
          className="mt-3 max-h-96 w-full rounded-lg border border-[rgb(var(--border))] object-cover"
        />
      )}

      <PostEngagement postId={post.id} />
    </article>
  )
}
