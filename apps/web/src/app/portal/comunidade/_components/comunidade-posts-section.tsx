import Link from 'next/link'
import { getPostsParaFeed, getPostIdsSalvos, type PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadePostsSectionProps {
  tenantId: string
  currentUser: CurrentUser
  cursor?: string
  /** 'descobrir' = stream sugerido; 'seguindo' = só quem o membro segue. */
  filtro?: 'descobrir' | 'seguindo'
}

export async function ComunidadePostsSection({
  tenantId,
  currentUser,
  cursor,
  filtro = 'descobrir',
}: ComunidadePostsSectionProps) {
  const [{ postsSeguindo, postsSugeridos, pageInfo }, salvoIds] = await Promise.all([
    getPostsParaFeed(tenantId, currentUser.id || undefined, { cursor, take: 20 }),
    currentUser.id ? getPostIdsSalvos(currentUser.id, tenantId) : Promise.resolve(new Set<string>()),
  ])

  const sortByDate = (a: PostSocialItem, b: PostSocialItem) => {
    const ta = a.criadoEm instanceof Date ? a.criadoEm.getTime() : new Date(a.criadoEm).getTime()
    const tb = b.criadoEm instanceof Date ? b.criadoEm.getTime() : new Date(b.criadoEm).getTime()
    return tb - ta
  }

  const stream: PostSocialItem[] =
    filtro === 'seguindo'
      ? [...postsSeguindo].sort(sortByDate)
      : postsSugeridos.length > 0
        ? [...postsSugeridos].sort(sortByDate)
        : [...postsSeguindo].sort(sortByDate)

  const preservaFiltro = filtro === 'seguindo' ? '&filtro=seguindo' : ''

  return (
    <>
      <section className="space-y-4">
        {stream.length === 0 ? (
          <ComunidadeFeedEmpty filtro={filtro} />
        ) : (
          stream.map((post, index) => (
            <MotionReveal key={post.id} index={index}>
              <FeedPostCard
                post={post}
                showTenantBadge={post.tenantId !== tenantId}
                currentUser={currentUser}
                salvo={salvoIds.has(post.id)}
              />
            </MotionReveal>
          ))
        )}
      </section>

      {pageInfo.hasMore && pageInfo.nextCursor && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/portal/comunidade?cursor=${encodeURIComponent(pageInfo.nextCursor)}${preservaFiltro}`}
            className="rounded-full border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Carregar mais
          </Link>
        </div>
      )}
    </>
  )
}
