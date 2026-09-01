'use client'

import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadePostsAnimatedProps {
  posts: PostSocialItem[]
  currentUser: CurrentUser
  tenantId?: string
  salvoIds?: Iterable<string>
  showTenantBadge?: boolean | 'auto'
  emptyTitle: string
  emptyDescription?: React.ReactNode
  emptyIcon?: React.ReactNode
  emptyClassName?: string
  isAuthor?: boolean
  podeModerarGrupo?: boolean
  className?: string
  contextoComunidadeNome?: string | null
}

/** Lista de posts com stagger e empty state animado. */
export function ComunidadePostsAnimated({
  posts,
  currentUser,
  tenantId,
  salvoIds,
  showTenantBadge = false,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyClassName,
  isAuthor,
  podeModerarGrupo = false,
  className,
  contextoComunidadeNome = null,
}: ComunidadePostsAnimatedProps) {
  const salvoSet = salvoIds
    ? salvoIds instanceof Set
      ? salvoIds
      : new Set(salvoIds)
    : new Set<string>()

  if (posts.length === 0) {
    return (
      <MotionEmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        className={
          emptyClassName ??
          'rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-14 text-center text-sm text-[rgb(var(--foreground-muted))]'
        }
      />
    )
  }

  return (
    <section className={className ?? 'space-y-4'}>
      {posts.map((post, index) => (
        <MotionReveal key={post.id} index={index}>
          <FeedPostCard
            post={post}
            currentUser={currentUser}
            salvo={salvoSet.has(post.id)}
            showTenantBadge={
              showTenantBadge === 'auto' && tenantId
                ? post.tenantId !== tenantId
                : !!showTenantBadge
            }
            isAuthor={isAuthor ?? post.autorId === currentUser.id}
            podeModerarGrupo={podeModerarGrupo}
            contextoComunidadeNome={contextoComunidadeNome}
          />
        </MotionReveal>
      ))}
    </section>
  )
}
