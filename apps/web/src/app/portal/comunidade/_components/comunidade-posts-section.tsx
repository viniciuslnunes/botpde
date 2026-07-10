import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { getPostsParaFeed, getPostIdsSalvos, type PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadePostsSectionProps {
  tenantId: string
  currentUser: CurrentUser
  cursor?: string
}

export async function ComunidadePostsSection({
  tenantId,
  currentUser,
  cursor,
}: ComunidadePostsSectionProps) {
  const [{ postsSeguindo, postsSugeridos, pageInfo }, salvoIds] = await Promise.all([
    getPostsParaFeed(tenantId, currentUser.id || undefined, { cursor, take: 20 }),
    currentUser.id ? getPostIdsSalvos(currentUser.id, tenantId) : Promise.resolve(new Set<string>()),
  ])

  const stream: PostSocialItem[] =
    postsSugeridos.length > 0
      ? [...postsSugeridos].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
      : [...postsSeguindo].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())

  return (
    <>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <MessagesSquare className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          Descobrir na comunidade
        </h2>
        {postsSugeridos.length > 0 && postsSeguindo.length > 0 && (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            <Link href="/portal/comunidade/rede" className="font-medium text-[rgb(var(--primary))] hover:underline">
              Ver só quem você segue →
            </Link>
          </p>
        )}
        {stream.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
            <MessagesSquare className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              O feed começa com você
            </p>
            <p className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">
              Publique a primeira mensagem ou siga outros membros para ver o que a torcida está
              falando.
            </p>
          </div>
        ) : (
          stream.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              showTenantBadge={post.tenantId !== tenantId}
              currentUser={currentUser}
              salvo={salvoIds.has(post.id)}
            />
          ))
        )}
      </section>

      {pageInfo.hasMore && pageInfo.nextCursor && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/portal/comunidade?cursor=${encodeURIComponent(pageInfo.nextCursor)}`}
            className="rounded-full border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Carregar mais
          </Link>
        </div>
      )}
    </>
  )
}
